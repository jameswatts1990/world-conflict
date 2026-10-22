// Strategy map: baked shaded-relief terrain under translucent ownership tints,
// glowing national borders, plated city labels, towns and army counters with
// national unit art. Static geography is projected once and memoised; ownership,
// labels (on zoom) and army markers (every frame) update.
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  armyMorale,
  atWar,
  findPath,
  isArmyInTransit,
  isRouted,
  nationName,
  unitGen,
  type Army,
  type ArmyId,
  type GameState,
  type NationId,
  type ProvinceId,
  type World,
} from '../../sim';
import { CounterArt } from '../art/adapters';
import { darken, lighten, ownerColor, strengthColor } from '../color';
import { formatDuration } from '../format';
import type { GameController } from '../game/GameController';
import { Icon } from '../icons';
import { composition, mainUnitType } from '../labels';
import { MAP_HEIGHT, MAP_WIDTH, THEATRE_ISO, type MapGeometry } from './geo';
import { TERRAIN_BASE, seaGlowTexture, terrainTexture, type TerrainTexture } from './terrain';

export type MapMode = 'political' | 'terrain' | 'supply' | 'morale' | 'development';

export interface MapViewProps {
  ctrl: GameController;
  geo: MapGeometry;
  selectedProvince: ProvinceId | null;
  selectedArmies: ArmyId[];
  moveMode: boolean;
  focus: { province: ProvinceId; seq: number } | null;
  mapMode: MapMode;
  /** Screen pixels on the right covered by floating panels; fitting and centring avoid them. */
  insetRight: number;
  onSelectProvince: (pid: ProvinceId | null) => void;
  onSelectArmy: (id: ArmyId, additive: boolean) => void;
  onOrderMove: (pid: ProvinceId) => void;
  /** Province under the cursor, and the army counter if pointing at one. */
  onHover: (pid: ProvinceId | null, army?: ArmyId) => void;
}

/** Zoom ratios (relative to the initial fit) at which labels change. */
const ZOOM = { detail: 0.32, provinceNames: 1.7, majorCities: 1.7, towns: 2.6, capitals: 0.75, townDots: 2.0, townNames: 3.2 };
/** Closest zoom (relative to the fit): beyond it the baked relief texture turns blurry. */
const MAX_ZOOM = 7;

/** Red → amber → green ramp for 0..1. */
export function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const stops = [
    [176, 64, 52],
    [214, 168, 72],
    [92, 150, 84],
  ];
  const seg = x < 0.5 ? 0 : 1;
  const f = x < 0.5 ? x * 2 : (x - 0.5) * 2;
  const c = stops[seg].map((v, i) => Math.round(v + (stops[seg + 1][i] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Province morale mapped onto the ramp: 20 or less is red, 85 or more green. */
export const moraleRamp = (morale: number) => rampColor((morale - 20) / 65);

/** City tier 1–5 colours for the development map mode. */
export const TIER_COLORS = ['', '#d9d2bd', '#c8b27a', '#c08a48', '#a8573a', '#7a2f3a'];

// ---------------------------------------------------------------------------
// Static layers
// ---------------------------------------------------------------------------

const SeaLayer = memo(function SeaLayer({ geo, glow }: { geo: MapGeometry; glow: TerrainTexture | null }) {
  const [[x0, y0], [x1, y1]] = geo.worldBounds;
  return (
    <g className="sea-layer" pointerEvents="none">
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="ocean" />
      <path d={geo.graticule} className="graticule" />
      {glow && <image href={glow.href} x={glow.x} y={glow.y} width={glow.width} height={glow.height} preserveAspectRatio="none" className="terrain-img" />}
    </g>
  );
});

const WorldLayer = memo(function WorldLayer({ geo }: { geo: MapGeometry }) {
  return (
    <g className="world-layer">
      {geo.countries.map((c) => (
        <path key={c.iso + c.name} d={c.d} className="country">
          <title>{THEATRE_ISO.has(c.iso) ? `${c.name}: territory outside this campaign's theatre` : `${c.name}: outside this campaign's theatre`}</title>
        </path>
      ))}
    </g>
  );
});

/** Flat terrain colours, replaced by the shaded-relief bitmap once it is baked. */
const TerrainLayer = memo(function TerrainLayer({ geo, world, texture }: { geo: MapGeometry; world: World; texture: TerrainTexture | null }) {
  return (
    <g className="terrain-layer" pointerEvents="none">
      {world.provinceIds.map((id) => (
        <path key={id} id={`prov-${id}`} d={geo.provincePaths[id]} fill={TERRAIN_BASE[world.provinces[id].terrain]} />
      ))}
      {texture && (
        <image
          href={texture.href}
          x={texture.x}
          y={texture.y}
          width={texture.width}
          height={texture.height}
          preserveAspectRatio="none"
          className="terrain-img"
        />
      )}
    </g>
  );
});

interface ProvinceLayerProps {
  geo: MapGeometry;
  world: World;
  owners: string; // ownership signature, forces re-render when it changes
  supplied: string; // supply signature, for the supply map mode
  /** Per-province morale (morale mode) or city tier (development mode), joined by '|'. */
  values: string;
  ownerOf: Record<ProvinceId, string>;
  human: NationId;
  mode: MapMode;
  onClick: (pid: ProvinceId, e: React.MouseEvent) => void;
  onContext: (pid: ProvinceId, e: React.MouseEvent) => void;
  onHover: (pid: ProvinceId | null) => void;
}

function tint(p: ProvinceLayerProps, id: ProvinceId, i: number, values: string[]): { fill: string; opacity: number } {
  const owner = p.ownerOf[id];
  const neutral = owner === 'neutral';
  if (p.mode === 'morale') {
    if (neutral) return { fill: ownerColor(p.world, owner), opacity: 0.12 };
    return { fill: moraleRamp(Number(values[i])), opacity: 0.66 };
  }
  if (p.mode === 'development') return { fill: TIER_COLORS[Number(values[i])], opacity: 0.66 };
  if (p.mode === 'supply') {
    if (owner === p.human) return { fill: p.supplied[i] === '1' ? '#3fae5a' : '#e0473a', opacity: 0.55 };
    return { fill: ownerColor(p.world, owner), opacity: 0.12 };
  }
  if (p.mode === 'terrain') return { fill: ownerColor(p.world, owner), opacity: neutral ? 0.08 : 0.16 };
  return { fill: ownerColor(p.world, owner), opacity: neutral ? 0.34 : 0.56 };
}

const ProvinceLayer = memo(function ProvinceLayer(p: ProvinceLayerProps) {
  const values = p.values.split('|');
  return (
    <g className="province-layer">
      {p.world.provinceIds.map((id, i) => {
        const owner = p.ownerOf[id];
        const t = tint(p, id, i, values);
        return (
          <path
            key={id}
            d={p.geo.provincePaths[id]}
            fill={t.fill}
            fillOpacity={t.opacity}
            className={`province${owner === 'neutral' ? ' neutral' : ''}`}
            data-province={id}
            onClick={(e) => p.onClick(id, e)}
            onContextMenu={(e) => p.onContext(id, e)}
            onMouseEnter={() => p.onHover(id)}
            onMouseLeave={() => p.onHover(null)}
          />
        );
      })}
      {/* Hatch overlay marks neutral minor states */}
      {p.mode !== 'supply' &&
        p.mode !== 'development' &&
        p.world.provinceIds
          .filter((id) => p.ownerOf[id] === 'neutral')
          .map((id) => <path key={`h-${id}`} d={p.geo.provincePaths[id]} className="neutral-hatch" pointerEvents="none" />)}
    </g>
  );
});

const BorderLayer = memo(function BorderLayer({
  geo,
  world,
  owners,
  ownerOf,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
}) {
  // Each nation's outline is stroked wide in its colour and clipped to its own
  // territory, giving the inner border glow; the shared border sits on top.
  const outlines = useMemo(() => {
    const own = (pid: ProvinceId) => ownerOf[pid];
    return world.nationIds
      .map((n) => ({ id: n, color: world.nations[n].color, pids: world.provinceIds.filter((pid) => ownerOf[pid] === n) }))
      .filter((o) => o.pids.length > 0)
      .map((o) => ({ ...o, d: geo.ownerOutline(o.id, own) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, world, owners]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nationBorders = useMemo(() => geo.nationBorders((pid) => ownerOf[pid]), [geo, owners]);
  return (
    <g className="border-layer" pointerEvents="none">
      <defs>
        {outlines.map((o) => (
          <clipPath key={o.id} id={`clip-own-${o.id}`}>
            {o.pids.map((pid) => (
              <use key={pid} href={`#prov-${pid}`} />
            ))}
          </clipPath>
        ))}
      </defs>
      <path d={geo.provinceBorders} className="province-border" />
      {outlines.map((o) => (
        <g key={o.id} clipPath={`url(#clip-own-${o.id})`}>
          <path d={o.d} className="nation-glow wide" stroke={o.color} />
          <path d={o.d} className="nation-glow" stroke={lighten(o.color, 0.35)} />
        </g>
      ))}
      <path d={nationBorders} className="nation-border" />
      <path d={geo.coastline} className="coastline" />
    </g>
  );
});

const ConnectionLayer = memo(function ConnectionLayer({ geo, world, focusIds }: { geo: MapGeometry; world: World; focusIds: string }) {
  const focus = new Set(focusIds ? focusIds.split(',') : []);
  return (
    <g className="connection-layer" pointerEvents="none">
      {world.scenario.connections.map((c) => {
        const [x1, y1] = geo.anchors[c.a];
        const [x2, y2] = geo.anchors[c.b];
        const active = focus.has(c.a) || focus.has(c.b);
        return (
          <line key={`${c.a}|${c.b}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`connection ${c.kind}${active ? ' active' : ''}`} />
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

interface NationLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  neutral: boolean;
}

/** Owned provinces in groups joined by land; sea crossings separate them (Britain from occupied France). */
function landGroups(world: World, pids: ProvinceId[]): ProvinceId[][] {
  const owned = new Set(pids);
  const seen = new Set<ProvinceId>();
  const groups: ProvinceId[][] = [];
  for (const start of pids) {
    if (seen.has(start)) continue;
    seen.add(start);
    const group = [start];
    for (let i = 0; i < group.length; i++) {
      for (const n of world.neighbors[group[i]]) {
        if (n.kind === 'strait' || !owned.has(n.id) || seen.has(n.id)) continue;
        seen.add(n.id);
        group.push(n.id);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** How crowded a map point is: army stacks sit above each city and name plates below it. */
function crowding(geo: MapGeometry, x: number, y: number): number {
  let c = 0;
  for (const [ax, ay] of Object.values(geo.anchors)) {
    const dx = (x - ax) / 28;
    const dy = (y - ay + 12) / 36;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1) c += 1 - d2;
  }
  return c;
}

/** Name for one block of territory: near its middle, but clear of cities and counters. */
function placeNationLabel(geo: MapGeometry, id: string, text: string, group: ProvinceId[]): NationLabel {
  let area = 0;
  let cx = 0;
  let cy = 0;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pid of group) {
    const a = geo.provinceArea[pid];
    area += a;
    cx += geo.labelPoints[pid][0] * a;
    cy += geo.labelPoints[pid][1] * a;
    const [[bx0, by0], [bx1, by1]] = geo.provinceBounds[pid];
    [x0, y0, x1, y1] = [Math.min(x0, bx0), Math.min(y0, by0), Math.max(x1, bx1), Math.max(y1, by1)];
  }
  cx /= area;
  cy /= area;
  // Letter-spaced capitals take about 0.94 em per character. Shrink to fit narrow territory.
  const size = Math.max(9, Math.min(32, Math.sqrt(area) * 0.12, ((x1 - x0) * 0.92) / (text.length * 0.94)));
  const half = (text.length * size * 0.94) / 2;
  let best = { x: cx, y: cy, score: Infinity };
  const fits = x1 - x0 > 2 * half;
  for (const pid of group) {
    const [px, py] = geo.labelPoints[pid];
    for (const dx of fits ? [0, -0.5, 0.5] : [0]) {
      const x = fits ? Math.max(x0 + half, Math.min(x1 - half, px + dx * half)) : (x0 + x1) / 2;
      for (const dy of [0, -0.8, 0.8, -1.6, 1.6]) {
        const y = py + dy * size;
        if (y < y0 + size / 2 || y > y1 - size / 2) continue;
        let crowd = 0;
        for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) crowd += crowding(geo, x + (i / 2) * half, y + j * 0.35 * size);
        const score = crowd + (6 * Math.hypot(x - cx, y - cy)) / Math.sqrt(area);
        if (score < best.score) best = { x, y, score };
      }
    }
  }
  return { id, text, x: best.x, y: best.y, size, neutral: false };
}

function nationLabels(geo: MapGeometry, world: World, ownerOf: Record<ProvinceId, string>): NationLabel[] {
  const out: NationLabel[] = [];
  for (const n of world.nationIds) {
    const pids = world.provinceIds.filter((pid) => ownerOf[pid] === n);
    if (!pids.length) continue;
    const groups = landGroups(world, pids)
      .map((g) => ({ g, area: g.reduce((s, pid) => s + geo.provinceArea[pid], 0) }))
      .sort((a, b) => b.area - a.area);
    // Large separate blocks (say, a conquered neighbour across the sea) carry the name too.
    groups
      .filter((x, i) => i === 0 || x.area >= groups[0].area * 0.3)
      .forEach((x, i) => out.push(placeNationLabel(geo, `${n}-${i}`, world.nations[n].name, x.g)));
  }
  for (const pid of world.provinceIds) {
    if (ownerOf[pid] !== 'neutral') continue;
    const [x, y] = geo.labelPoints[pid];
    const name = world.provinces[pid].neutral?.name ?? world.provinces[pid].name;
    out.push({ id: pid, text: name, x, y, size: Math.max(6, Math.min(10, Math.sqrt(geo.provinceArea[pid]) * 0.07)), neutral: true });
  }
  return out;
}

function LabelLayer({
  geo,
  world,
  owners,
  ownerOf,
  k,
  ratio,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
  k: number;
  ratio: number;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labels = useMemo(() => nationLabels(geo, world, ownerOf), [geo, world, owners]);
  if (ratio < ZOOM.provinceNames) {
    return (
      <g className="label-layer" pointerEvents="none">
        {labels.map((l) => (
          <text key={l.id} x={l.x} y={l.y} fontSize={l.size} className={`nation-label${l.neutral ? ' neutral' : ''}`}>
            {l.text}
          </text>
        ))}
      </g>
    );
  }
  const s = 1 / k;
  return (
    <g className="label-layer" pointerEvents="none">
      {world.provinceIds.map((id) => {
        let [x, y] = geo.labelPoints[id];
        const [ax, ay] = geo.anchors[id];
        // Keep the name clear of the city marker, its plate and any army stack above it.
        if (Math.abs(x - ax) * k < 80 && (y - ay) * k > -70 && (y - ay) * k < 40) {
          x = ax;
          y = ay + 30 * s;
        }
        return (
          <text key={id} x={x} y={y + 12 * s} fontSize={10.5 * s} strokeWidth={2.6 * s} className="province-label">
            {world.provinces[id].name}
          </text>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Cities and objectives
// ---------------------------------------------------------------------------

const STAR = 'M0,-6 L1.8,-1.9 L6,-1.9 L2.6,0.8 L3.8,5 L0,2.5 L-3.8,5 L-2.6,0.8 L-6,-1.9 L-1.8,-1.9 Z';

/** Dark label plate centred under a point (in screen pixels, before 1/k scaling). */
function Plate({ text, y, color, size = 10, className = '' }: { text: string; y: number; color?: string; size?: number; className?: string }) {
  const w = text.length * size * 0.56 + 12;
  const h = size + 5;
  return (
    <g className={`plate ${className}`}>
      <rect x={-w / 2} y={y} width={w} height={h} rx={2.5} className="plate-bg" />
      {color && <rect x={-w / 2} y={y} width={3} height={h} rx={1} fill={color} />}
      <text y={y + h / 2 + size * 0.36} x={color ? 1.5 : 0} fontSize={size} className="plate-text">
        {text}
      </text>
    </g>
  );
}

function CityLayer({ geo, state, world, k, ratio }: { geo: MapGeometry; state: GameState; world: World; k: number; ratio: number }) {
  const s = 1 / k;
  return (
    <g className="city-layer" pointerEvents="none">
      {ratio >= ZOOM.townDots &&
        world.provinceIds.map((id) =>
          geo.towns[id].map((t) => (
            <g key={`${id}-${t.name}`} transform={`translate(${t.x},${t.y}) scale(${s})`}>
              <circle r={1.8} className="town-dot" />
              {ratio >= ZOOM.townNames && (
                <text y={-4.5} className="town-label">
                  {t.name}
                </text>
              )}
            </g>
          )),
        )}
      {world.provinceIds.map((id) => {
        const def = world.provinces[id];
        const [x, y] = geo.anchors[id];
        const ps = state.provinces[id];
        const capture = ps.capture;
        const size = def.city.size;
        const isCapital = size === 'capital';
        // Markers grow with the city: tier 1 (town) to tier 5 (world city).
        const tierScale = 0.76 + ps.tier * 0.12;
        const showName = isCapital ? ratio >= ZOOM.capitals : size === 'major' ? ratio >= ZOOM.majorCities : ratio >= ZOOM.towns;
        return (
          <g key={id} transform={`translate(${x},${y}) scale(${s})`}>
            {capture && (
              <g className="capture">
                <circle r={11} className="capture-track" />
                <circle
                  r={11}
                  className="capture-ring"
                  stroke={world.nations[capture.by]?.color}
                  strokeDasharray={`${(capture.progress / capture.required) * 69.1} 69.1`}
                  transform="rotate(-90)"
                />
              </g>
            )}
            <g transform={`scale(${tierScale})`}>
              {isCapital ? (
                <g className={`city-icon capital${def.core ? ' national' : ''}`}>
                  <circle r={6.6} />
                  <path d={STAR} transform="scale(0.72)" />
                </g>
              ) : size === 'major' ? (
                <g className="city-icon major">
                  <circle r={4.2} />
                  <circle r={1.6} className="dot" />
                </g>
              ) : (
                <circle r={2.7} className="city-icon town" />
              )}
            </g>
            {def.objectiveVp ? (
              <g className="vp-badge-map" transform={`translate(${isCapital ? 11 : 9},1)`}>
                <circle r={5.6} />
                <text y={3.1}>{def.objectiveVp}</text>
              </g>
            ) : null}
            {showName && (
              <Plate
                text={def.city.name}
                y={isCapital ? 8.5 : 6.5}
                color={ownerColor(world, ps.owner)}
                size={isCapital ? 10.5 : 9.5}
                className={isCapital ? 'capital' : ''}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Armies, routes and battles
// ---------------------------------------------------------------------------

function armyPosition(geo: MapGeometry, army: Army, alpha: number): [number, number] {
  const leg = army.move?.leg;
  if (!leg) return geo.anchors[army.province];
  const t = Math.min(1, (leg.elapsed + alpha) / leg.duration);
  const [x1, y1] = geo.anchors[leg.from];
  const [x2, y2] = geo.anchors[leg.to];
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

function starburst(outer: number, inner: number, points: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const BURST_OUTER = starburst(11, 5, 9);
const BURST_INNER = starburst(6, 2.8, 7);

/** Where an army can be attacked: where it stands, or where it is about to arrive. */
function armyTarget(army: Army): ProvinceId {
  return army.move?.leg ? army.move.leg.to : army.province;
}

/** Stationary counters sit above their city in rows of two (screen pixels). */
const STACK = { base: 19, row: 27, half: 23 };

/** Army ids by creation order: "a9" before "a10". */
function byCreation(a: Army, b: Army): number {
  return Number(a.id.slice(1)) - Number(b.id.slice(1)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function ArmyMarker({
  army,
  state,
  x,
  y,
  k,
  selected,
  own,
  hostile,
  onClick,
  onContext,
  onHover,
}: {
  army: Army;
  state: GameState;
  x: number;
  y: number;
  k: number;
  selected: boolean;
  own: boolean;
  hostile: boolean;
  onClick: (army: Army, additive: boolean) => void;
  onContext: (army: Army) => void;
  onHover: (pid: ProvinceId | null, army?: ArmyId) => void;
}) {
  const c = composition(army);
  const main = mainUnitType(c);
  const avg = c.strength;
  const morale = armyMorale(army);
  const routed = isRouted(state, army);
  return (
    <g
      transform={`translate(${x},${y}) scale(${1 / k})`}
      className={`army-marker${selected ? ' selected' : ''}${own ? ' own' : ''}${hostile ? ' hostile' : ''}${army.supplied ? '' : ' unsupplied'}${routed ? ' routed' : ''}`}
      data-army={army.id}
      onClick={(e) => {
        e.stopPropagation();
        onClick(army, e.shiftKey);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContext(army);
      }}
      onMouseEnter={() => onHover(armyTarget(army), army.id)}
      onMouseLeave={() => onHover(null)}
    >
      <rect x={-21} y={-11} width={42} height={20} rx={4} fill={`url(#ag-${army.owner})`} className="army-body" />
      <ellipse cx={1} cy={17} rx={20} ry={3.2} className="army-shadow" />
      <CounterArt type={main} gen={unitGen(state, army.owner, main)} nation={army.owner} x={-19.5} y={-8.6} width={23} />
      <text x={12.2} y={4.7} className="army-count">
        {army.units.length}
      </text>
      <rect x={-21} y={10.6} width={42} height={6.2} rx={1.6} className="army-hp-bg" />
      <rect x={-21} y={10.6} width={42 * avg} height={3} rx={1.5} fill={strengthColor(avg)} />
      <rect x={-21} y={14} width={42 * morale} height={2.6} rx={1.3} className={`army-morale ${morale >= 0.6 ? 'high' : morale >= 0.35 ? 'mid' : 'low'}`} />
      {routed && <path d="M15,-10 L15,-22 L24,-19 L15,-16" className="routed-flag" />}
      {!army.supplied && (
        <g transform="translate(20,-11)" className="army-badge warn">
          <circle r={5.4} />
          <text y={2.9}>!</text>
        </g>
      )}
      {selected && <rect x={-25.5} y={-15.5} width={51} height={36.5} rx={6} className="army-select" />}
    </g>
  );
}

function ArmyLayer({
  ctrl,
  geo,
  k,
  selectedArmies,
  onArmyClick,
  onArmyContext,
  onHover,
}: {
  ctrl: GameController;
  geo: MapGeometry;
  k: number;
  selectedArmies: ArmyId[];
  onArmyClick: (army: Army, additive: boolean) => void;
  onArmyContext: (army: Army) => void;
  onHover: (pid: ProvinceId | null, army?: ArmyId) => void;
}) {
  // Re-render every animation frame for smooth interpolation of marching armies.
  useSyncExternalStore(ctrl.subscribeFrame, () => ctrl.state.tick * 1000 + Math.floor(ctrl.loop.alpha * 1000));
  const { state, human } = ctrl;
  const alpha = ctrl.loop.paused ? 0 : ctrl.loop.alpha;
  const selected = new Set(selectedArmies);
  const relations = state.nations[human].relations;
  const armies = Object.values(state.armies).sort(byCreation);

  // Armies standing in a province fill rows of two above its city, yours first, so
  // a crowded province grows a short pyramid rather than a tower over its neighbours.
  const stacks = new Map<ProvinceId, Army[]>();
  for (const a of armies) {
    if (isArmyInTransit(a)) continue;
    const list = stacks.get(a.province) ?? [];
    list.push(a);
    stacks.set(a.province, list);
  }
  const offsets = new Map<ArmyId, [number, number]>();
  for (const list of stacks.values()) {
    list.sort((a, b) => Number(b.owner === human) - Number(a.owner === human) || byCreation(a, b));
    list.forEach((a, i) => {
      const lone = i % 2 === 0 && i === list.length - 1;
      const dx = lone ? 0 : i % 2 === 0 ? -STACK.half : STACK.half;
      offsets.set(a.id, [dx / k, -(STACK.base + Math.floor(i / 2) * STACK.row) / k]);
    });
  }
  // Drawn bottom to top: other nations' armies, then yours (marching ones above those
  // standing still), the selection last, so clicks land on what you most likely meant.
  const layer = (a: Army) => (selected.has(a.id) ? 4 : 0) + (a.owner === human ? 2 : 0) + (isArmyInTransit(a) ? 1 : 0);
  const drawOrder = [...armies].sort((a, b) => layer(a) - layer(b) || byCreation(a, b));

  const routes: ReactNode[] = [];
  const markers: ReactNode[] = [];
  for (const army of drawOrder) {
    let [x, y] = armyPosition(geo, army, alpha);
    const offset = offsets.get(army.id);
    if (offset) {
      x += offset[0];
      y += offset[1];
    }
    const own = army.owner === human;
    if (army.move && (own || selected.has(army.id))) {
      const pts: [number, number][] = [[x, y]];
      for (const pid of army.move.path) pts.push(geo.anchors[pid]);
      if (pts.length > 1) {
        const [ex, ey] = pts[pts.length - 1];
        const [px, py] = pts[pts.length - 2];
        const angle = (Math.atan2(ey - py, ex - px) * 180) / Math.PI;
        const line = pts.map((p) => p.join(',')).join(' ');
        routes.push(
          <g key={`r-${army.id}`} className={`route${selected.has(army.id) ? ' selected' : ''}${own ? '' : ' foreign'}`}>
            <polyline points={line} className="route-casing" />
            <polyline points={line} className="route-line" />
            <path d="M-8,-5 L1,0 L-8,5 Z" transform={`translate(${ex},${ey}) rotate(${angle}) scale(${1 / k})`} className="route-head" />
          </g>,
        );
      }
    }
    const hostile = army.owner !== 'neutral' && !own && relations[army.owner]?.status === 'war';
    markers.push(
      <ArmyMarker
        key={army.id}
        army={army}
        state={state}
        x={x}
        y={y}
        k={k}
        selected={selected.has(army.id)}
        own={own}
        hostile={hostile}
        onClick={onArmyClick}
        onContext={onArmyContext}
        onHover={onHover}
      />,
    );
  }

  const battles = Object.keys(state.battles).map((pid) => {
    const [x, y] = geo.anchors[pid];
    return (
      <g key={`b-${pid}`} transform={`translate(${x + 17 / k},${y - 4 / k}) scale(${1 / k})`} className="battle-fx" pointerEvents="none">
        <circle r={12} className="battle-pulse" />
        <path d={BURST_OUTER} className="battle-burst" />
        <path d={BURST_INNER} className="battle-core" />
      </g>
    );
  });

  return (
    <g className="army-layer">
      <g pointerEvents="none">{routes}</g>
      {markers}
      {battles}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

const MiniMapBase = memo(function MiniMapBase({
  geo,
  world,
  owners,
  ownerOf,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
}) {
  // Only the countries around the theatre are visible in the overview.
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const near = geo.countries.filter((c) => c.bounds[1][0] > bx0 - 200 && c.bounds[0][0] < bx1 + 200 && c.bounds[1][1] > by0 - 200 && c.bounds[0][1] < by1 + 200);
  return (
    <g data-owners={owners}>
      {near.map((c) => (
        <path key={c.iso + c.name} d={c.d} className="mm-country" />
      ))}
      {world.provinceIds.map((id) => (
        <path key={id} d={geo.provincePaths[id]} fill={ownerColor(world, ownerOf[id])} className="mm-province" />
      ))}
    </g>
  );
});

function MiniMap({
  geo,
  world,
  owners,
  ownerOf,
  view,
  onNavigate,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
  view: [number, number, number, number];
  onNavigate: (x: number, y: number, animate: boolean) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const pad = 40;
  const vb = [bx0 - pad, by0 - pad, bx1 - bx0 + 2 * pad, by1 - by0 + 2 * pad];
  const toMap = (e: React.PointerEvent) => {
    const m = ref.current!.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [pt.x, pt.y] as const;
  };
  return (
    <div className="minimap" title="Overview: click or drag to move the view">
      <svg
        ref={ref}
        viewBox={vb.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toMap(e);
          if (p) onNavigate(p[0], p[1], true);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const p = toMap(e);
          if (p) onNavigate(p[0], p[1], false);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} className="mm-sea" />
        <MiniMapBase geo={geo} world={world} owners={owners} ownerOf={ownerOf} />
        <rect x={view[0]} y={view[1]} width={view[2]} height={view[3]} className="mm-view" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map component
// ---------------------------------------------------------------------------

/** Stable function identity that always calls the latest closure (keeps memoised layers cheap). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useStableCallback<A extends any[]>(fn: (...args: A) => void): (...args: A) => void {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

function fitFor(width: number, height: number, inset: number) {
  const usable = Math.max(240, width - inset);
  const k = Math.min(usable / MAP_WIDTH, height / MAP_HEIGHT);
  return { k, transform: zoomIdentity.translate((usable - MAP_WIDTH * k) / 2, (height - MAP_HEIGHT * k) / 2).scale(k) };
}

/**
 * Opening view: the player's own territory, somewhat closer than the whole theatre and
 * framed above the field reports (bottom left), which would otherwise hide Iberia.
 */
function homeView(geo: MapGeometry, pids: ProvinceId[], width: number, height: number, inset: number): ZoomTransform {
  const fit = fitFor(width, height, inset);
  if (pids.length === 0) return fit.transform;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pid of pids) {
    const [[a, b], [c, d]] = geo.provinceBounds[pid];
    [x0, y0, x1, y1] = [Math.min(x0, a), Math.min(y0, b), Math.max(x1, c), Math.max(y1, d)];
  }
  const w = Math.max(240, width - inset);
  const h = Math.max(240, height * 0.68);
  const k = Math.max(fit.k, Math.min(fit.k * 1.6, 0.7 * Math.min(w / (x1 - x0), h / (y1 - y0))));
  return zoomIdentity.translate(w / 2 - ((x0 + x1) / 2) * k, h / 2 - ((y0 + y1) / 2) * k).scale(k);
}

export function MapView(props: MapViewProps) {
  const { ctrl, geo } = props;
  const { world, state, human } = ctrl;
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const insetRef = useRef(props.insetRight);
  insetRef.current = props.insetRight;
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [fitK, setFitK] = useState(1);
  const [size, setSize] = useState<[number, number]>([1, 1]);
  const [hovered, setHovered] = useState<ProvinceId | null>(null);
  const [texture, setTexture] = useState<TerrainTexture | null>(null);
  const [glow, setGlow] = useState<TerrainTexture | null>(null);

  useEffect(() => {
    let live = true;
    terrainTexture(geo, world).then((t) => live && setTexture(t));
    seaGlowTexture(geo).then((t) => live && setGlow(t));
    return () => {
      live = false;
    };
  }, [geo, world]);

  // Zoom & pan.
  useEffect(() => {
    const svg = svgRef.current!;
    const { width, height } = svg.getBoundingClientRect();
    const fit = fitFor(width, height, insetRef.current);
    const [[x0, y0], [x1, y1]] = geo.worldBounds;
    const minK = Math.max(0.05, Math.min(width / (x1 - x0), height / (y1 - y0)));
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minK, fit.k * MAX_ZOOM])
      .translateExtent([
        [x0, y0],
        [x1, y1],
      ])
      .clickDistance(5)
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(e.transform));
    zoomRef.current = behavior;
    setFitK(fit.k);
    setSize([width, height]);
    const sel = select(svg);
    sel.call(behavior).on('dblclick.zoom', null);
    const home = world.provinceIds.filter((id) => ctrl.state.provinces[id].owner === ctrl.human);
    sel.call(behavior.transform, homeView(geo, home, width, height, insetRef.current));
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      setSize([r.width, r.height]);
    });
    ro.observe(svg);
    return () => {
      ro.disconnect();
      sel.on('.zoom', null);
    };
  }, [geo, world, ctrl]);

  const centreOn = useCallback((x: number, y: number, k: number | null, duration: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    const { width, height } = svg.getBoundingClientRect();
    const cx = Math.max(120, width - insetRef.current) / 2;
    const sel = select(svg);
    if (k === null) {
      if (duration) sel.transition().duration(duration).call(behavior.translateTo, x, y, [cx, height / 2]);
      else sel.call(behavior.translateTo, x, y, [cx, height / 2]);
      return;
    }
    sel
      .transition()
      .duration(duration)
      .call(behavior.transform, zoomIdentity.translate(cx - x * k, height / 2 - y * k).scale(k));
  }, []);

  // Centre on a province when requested (e.g. clicking an event).
  useEffect(() => {
    if (!props.focus) return;
    const [x, y] = geo.anchors[props.focus.province];
    centreOn(x, y, Math.max(transform.k, fitK * 2.2), 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.seq]);

  const zoomBy = (factor: number) => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(220).call(zoomRef.current.scaleBy, factor);
  };
  const zoomFit = () => {
    const svg = svgRef.current;
    if (!svg || !zoomRef.current) return;
    const { width, height } = svg.getBoundingClientRect();
    select(svg).transition().duration(400).call(zoomRef.current.transform, fitFor(width, height, insetRef.current).transform);
  };

  const ownersSig = world.provinceIds.map((id) => state.provinces[id].owner).join(',');
  const suppliedSig = world.provinceIds.map((id) => (state.provinces[id].supplied ? '1' : '0')).join('');
  // Morale is shown in steps of 2 so the layer re-renders only on visible changes.
  const valuesSig =
    props.mapMode === 'morale'
      ? world.provinceIds.map((id) => Math.round(state.provinces[id].morale / 2) * 2).join('|')
      : props.mapMode === 'development'
        ? world.provinceIds.map((id) => state.provinces[id].tier).join('|')
        : '';
  const ownerOf = useMemo(() => {
    const o: Record<ProvinceId, string> = {};
    world.provinceIds.forEach((id, i) => (o[id] = ownersSig.split(',')[i]));
    return o;
  }, [world, ownersSig]);

  const primaryArmy = props.selectedArmies.length > 0 ? state.armies[props.selectedArmies[0]] : undefined;
  const ownArmySelected = !!primaryArmy && primaryArmy.owner === human;

  // Movement connections of the selected army (or the selected province) are highlighted.
  const focusIds = primaryArmy ? (primaryArmy.move?.leg?.to ?? primaryArmy.province) : (props.selectedProvince ?? '');

  // Route preview for the selected own army towards the hovered province.
  const preview = useMemo(() => {
    if (!ownArmySelected || !hovered) return null;
    const army = primaryArmy!;
    const from = army.move?.leg ? army.move.leg.to : army.province;
    if (hovered === from) return null;
    const route = findPath(state, world, army, from, hovered);
    if (!route) {
      const owner = state.provinces[hovered].owner;
      const peace = owner !== human && owner !== 'neutral' && !atWar(state, human, owner);
      return { to: hovered, path: null, ticks: 0, blocked: peace ? `At peace with ${nationName(world, owner)}` : 'No route' };
    }
    const legLeft = army.move?.leg ? army.move.leg.duration - army.move.leg.elapsed : 0;
    return { to: hovered, path: [from, ...route.path], ticks: route.ticks + legLeft, blocked: '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownArmySelected, hovered, primaryArmy?.id, primaryArmy?.move?.leg?.to, ownersSig, ctrl.version]);

  const onProvinceClick = useStableCallback((pid: ProvinceId) => {
    if (props.moveMode && ownArmySelected) props.onOrderMove(pid);
    else props.onSelectProvince(pid);
  });
  const onProvinceContext = useStableCallback((pid: ProvinceId, e: React.MouseEvent) => {
    e.preventDefault();
    if (ownArmySelected) props.onOrderMove(pid);
  });
  const onHover = useStableCallback((pid: ProvinceId | null, army?: ArmyId) => {
    setHovered(pid);
    props.onHover(pid, army);
  });
  // Clicking another army's counter in move mode, or right-clicking it, marches there.
  const ordersTo = (army: Army) => ownArmySelected && !props.selectedArmies.includes(army.id);
  const onArmyClick = useStableCallback((army: Army, additive: boolean) => {
    if (props.moveMode && ordersTo(army)) props.onOrderMove(armyTarget(army));
    else props.onSelectArmy(army.id, additive);
  });
  const onArmyContext = useStableCallback((army: Army) => {
    if (ordersTo(army)) props.onOrderMove(armyTarget(army));
  });

  const k = transform.k;
  const ratio = k / fitK;
  const view: [number, number, number, number] = [-transform.x / k, -transform.y / k, size[0] / k, size[1] / k];
  const showDetail = ratio >= ZOOM.detail;

  const owners: string[] = [...world.nationIds, 'neutral'];
  return (
    <div className="map-stage">
      <svg
        ref={svgRef}
        className={`map mode-${props.mapMode}${props.moveMode ? ' move-mode' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (!(e.target as Element).closest('[data-province],[data-army]')) props.onSelectProvince(null);
        }}
        data-zoom={k.toFixed(3)}
      >
        <defs>
          <radialGradient id="ocean-grad" gradientUnits="userSpaceOnUse" cx={MAP_WIDTH * 0.45} cy={MAP_HEIGHT * 0.5} r={MAP_WIDTH * 1.3}>
            <stop offset="0" stopColor="#2c5d7c" />
            <stop offset="0.45" stopColor="#1c425f" />
            <stop offset="1" stopColor="#0c1f31" />
          </radialGradient>
          {/* Hatching keeps the same on-screen spacing at every zoom. */}
          <pattern id="hatch-neutral" width={7 / k} height={7 / k} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2={7 / k} className="hatch-neutral-line" strokeWidth={1.3 / k} />
          </pattern>
          {owners.map((o) => {
            const c = ownerColor(world, o);
            return (
              <linearGradient key={o} id={`ag-${o}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={lighten(c, 0.3)} />
                <stop offset="0.5" stopColor={c} />
                <stop offset="1" stopColor={darken(c, 0.35)} />
              </linearGradient>
            );
          })}
        </defs>
        <g transform={transform.toString()}>
          <SeaLayer geo={geo} glow={glow} />
          <WorldLayer geo={geo} />
          <TerrainLayer geo={geo} world={world} texture={texture} />
          <ProvinceLayer
            geo={geo}
            world={world}
            owners={ownersSig}
            supplied={suppliedSig}
            values={valuesSig}
            ownerOf={ownerOf}
            human={human}
            mode={props.mapMode}
            onClick={onProvinceClick}
            onContext={onProvinceContext}
            onHover={onHover}
          />
          <BorderLayer geo={geo} world={world} owners={ownersSig} ownerOf={ownerOf} />
          <g className="overlay-layer" pointerEvents="none">
            {preview?.path?.map((pid) => <path key={pid} d={geo.provincePaths[pid]} className="reach" />)}
            {hovered && <path d={geo.provincePaths[hovered]} className="hover-outline" />}
            {props.selectedProvince && (
              <>
                <path d={geo.provincePaths[props.selectedProvince]} className="sel-casing" />
                <path d={geo.provincePaths[props.selectedProvince]} className="sel-line" />
              </>
            )}
          </g>
          {/* Zoomed far out the theatre is tiny: hide markers so the world context stays readable. */}
          {showDetail && (
            <>
              <ConnectionLayer geo={geo} world={world} focusIds={focusIds} />
              <LabelLayer geo={geo} world={world} owners={ownersSig} ownerOf={ownerOf} k={k} ratio={ratio} />
              <CityLayer geo={geo} state={state} world={world} k={k} ratio={ratio} />
              <ArmyLayer
                ctrl={ctrl}
                geo={geo}
                k={k}
                selectedArmies={props.selectedArmies}
                onArmyClick={onArmyClick}
                onArmyContext={onArmyContext}
                onHover={onHover}
              />
              {preview && (
                <g className={`route-preview${props.moveMode ? ' strong' : ''}${preview.path ? '' : ' blocked'}`} pointerEvents="none">
                  {preview.path && <polyline points={preview.path.map((pid) => geo.anchors[pid].join(',')).join(' ')} />}
                  <g transform={`translate(${geo.anchors[preview.to].join(',')}) scale(${1 / k})`}>
                    <Plate
                      text={preview.path ? `${world.provinces[preview.to].city.name} · ${formatDuration(preview.ticks, state)}` : preview.blocked}
                      y={-34}
                      size={10.5}
                      className="eta"
                    />
                  </g>
                </g>
              )}
            </>
          )}
        </g>
      </svg>
      <div className="map-vignette" />
      <div className="map-nav">
        <div className="zoom-controls">
          <button onClick={() => zoomBy(1.6)} title="Zoom in (mouse wheel)" aria-label="Zoom in">
            <Icon name="plus" />
          </button>
          <button onClick={() => zoomBy(1 / 1.6)} title="Zoom out (mouse wheel)" aria-label="Zoom out">
            <Icon name="minus" />
          </button>
          <button onClick={zoomFit} title="Show the whole theatre" aria-label="Fit theatre">
            <Icon name="fit" />
          </button>
        </div>
        <MiniMap
          geo={geo}
          world={world}
          owners={ownersSig}
          ownerOf={ownerOf}
          view={view}
          onNavigate={(x, y, animate) => centreOn(x, y, null, animate ? 250 : 0)}
        />
      </div>
    </div>
  );
}

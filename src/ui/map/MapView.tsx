// Strategy map: baked shaded-relief terrain under translucent ownership tints,
// glowing national borders, plated city labels, towns and army counters with
// national unit art. Zoomed in, every city is a web of streets on the map with a
// small 3D model of what it holds (coastal cities get their port), and every army
// a 3D model of its main unit, standing around its city or marching along its road.
// Static geography is projected once and memoised; ownership, labels (on zoom)
// and army markers (every frame) update.
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  armyMorale,
  atWar,
  buildingSlots,
  checkDeclareWar,
  connectionBetween,
  isArmyInTransit,
  isCity,
  isOpenRoad,
  isArmyVisible,
  nationName,
  planMarch,
  spotOnRoad,
  unitGen,
  type Army,
  type ArmyId,
  type GameState,
  type NationId,
  type OwnerId,
  type ProvinceId,
  type RoadHalt,
  type RoadSpot,
  type UnitType,
  type World,
} from '../../sim';
import { slotsUsed } from '../../sim/config/buildings';
import { CounterArt, citySprite, portSprite, unitSprite, type CitySprite, type CitySpriteProps, type PortSpriteProps, type SpriteImage } from '../art/adapters';
import { headingFor } from '../art/UnitModel';
import { darken, lighten, ownerColor, strengthColor, vivid } from '../color';
import { formatDuration } from '../format';
import type { GameController } from '../game/GameController';
import { FlagMark, flagKey } from '../flags';
import { Icon } from '../icons';
import { composition, mainUnitType, roadEndName } from '../labels';
import { citySpots, roadEnds, type Offset, type PlateBox } from './armyLayout';
import { MAP_HEIGHT, MAP_WIDTH, REACH_CAP, THEATRE_ISO, roadPoint, type MapGeometry } from './geo';
import {
  DETAIL_LEVELS,
  TERRAIN_BASE,
  bakedTile,
  detailLevel,
  fogTexture,
  requestTiles,
  seaGlowTexture,
  terrainTexture,
  tilesFor,
  type TerrainTexture,
  type TerrainTile,
} from './terrain';

export type MapMode = 'political' | 'terrain' | 'supply' | 'morale' | 'development';

/** Where a march order sends an army: a province's city, or a spot on a road out of it. */
export interface MarchTarget {
  province: ProvinceId;
  road?: RoadSpot;
}

/** Two targets close enough to be the same order (a second tap on a road need not land on the very same spot). */
export function sameTarget(a: MarchTarget | null, b: MarchTarget | null): boolean {
  if (!a || !b || a.province !== b.province) return false;
  if (!a.road || !b.road) return !a.road && !b.road;
  return a.road.toward === b.road.toward && Math.abs(a.road.at - b.road.at) < 0.06;
}

/** What an order's destination is called: the province, or the stretch of road (named for the cities it runs between). */
export function targetName(world: World, t: MarchTarget): string {
  if (!t.road) return world.provinces[t.province].name;
  return `${roadEndName(world, t.province)}–${roadEndName(world, t.road.toward)} road`;
}

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
  /** Screen pixels at the bottom covered by a panel (the compact layouts' bottom sheet). */
  insetBottom: number;
  /** Phone layouts: the map opens close in on the capital, detail waits for a closer zoom, and there is no overview map. */
  compact: boolean;
  /**
   * Touch input: there is no pointer to hover with, so in move mode the first tap on a
   * destination previews the route (`moveTarget`) and a second tap on it gives the order.
   */
  touch: boolean;
  moveTarget: MarchTarget | null;
  onPickTarget: (target: MarchTarget) => void;
  onSelectProvince: (pid: ProvinceId | null) => void;
  onSelectArmy: (id: ArmyId, additive: boolean) => void;
  /** Shift-drag (desktop): your armies inside the box. */
  onBoxSelect?: (ids: ArmyId[]) => void;
  onOrderMove: (target: MarchTarget) => void;
  /** Province under the cursor, and the army counter if pointing at one. */
  onHover: (pid: ProvinceId | null, army?: ArmyId) => void;
}

/** Zoom ratios (relative to the initial fit) at which labels change. */
const ZOOM = { detail: 0.32, nationNames: 1.7, majorCities: 1.7, towns: 2.6, capitals: 0.75, townDots: 2.0, cityModels: 1.15 };
/**
 * Closest zoom (relative to the fit). Counters, models and labels stop growing long before
 * it, so zooming in spreads a crowded front out; close-up terrain tiles keep the relief sharp.
 */
const MAX_ZOOM = 20;
/**
 * The zoom levels above are relative to the whole-theatre fit, but never to a fit smaller
 * than a 1280 × 720 desktop's. On a phone the theatre fits in a few hundred pixels, and
 * counters and 3D cities, drawn at a fixed screen size, would crowd it long before it is
 * zoomed in to their scale.
 */
const MIN_ZOOM_BASE = 0.8;
/**
 * On a phone, names and 3D cities wait for a closer zoom than on the desktop: it opens
 * closer in (COMPACT_OPENING, against the desktop base) with the cities no bigger, so
 * they stand apart.
 */
const COMPACT_DETAIL = 1.3;
const COMPACT_OPENING = 2.1;

/**
 * Screen pixels per model unit for the 3D cities at a zoom ratio, or 0 below the
 * ratio where cities are still drawn as symbols. Models grow more slowly than the
 * map, so neighbouring cities keep their distance.
 */
export function cityModelScale(ratio: number): number {
  if (ratio < ZOOM.cityModels) return 0;
  return Math.min(3.6, 0.4 + 0.8 * ratio);
}

/**
 * Model units per map unit where the sea comes closest to a city's buildings: where
 * cities first turn into models, on a desktop whose whole-theatre fit is 1. Closer in
 * the coast only moves further out, so buildings placed for this stay on land (on the
 * smallest screens, at the first zoom steps, a seaside building may touch the water).
 */
const REACH_SCALE = ZOOM.cityModels / cityModelScale(ZOOM.cityModels);

/**
 * What a city's model shows: its buildings, free slots, owner and state, and the roads and
 * coast round it. A city in the fog of war (`known` false) shows only its old town.
 */
function cityModelProps(state: GameState, world: World, geo: MapGeometry, id: ProvinceId, known: boolean): CitySpriteProps {
  const def = world.provinces[id];
  const ps = state.provinces[id];
  const job = known ? (ps.construction?.building ?? null) : null;
  return {
    seed: id,
    tier: ps.tier,
    capital: def.city?.size === 'capital',
    buildings: known ? ps.buildings : {},
    construction: job,
    freeSlots: known ? buildingSlots(state, world, id) - slotsUsed(ps.buildings, job) : 0,
    terrain: def.terrain,
    exits: geo.roads[id],
    // In model units, rounded so the sprite cache sees few distinct values; past the cap the land goes on.
    reach: geo.reach[id]?.map((r) => (r >= REACH_CAP ? 99 : Math.round(r * REACH_SCALE * 2) / 2)),
    nationColor: ps.owner === 'neutral' ? undefined : ownerColor(world, ps.owner),
    battle: known && !!state.battles[id],
  };
}

/** What a coastal city's port shows, or null inland (in the fog of war, an empty quay). */
function portModelProps(state: GameState, world: World, geo: MapGeometry, id: ProvinceId, known: boolean): PortSpriteProps | null {
  const port = geo.ports[id];
  if (!port) return null;
  const ps = state.provinces[id];
  return {
    seed: id,
    facing: port.facing,
    batteries: known ? (ps.buildings.coastalBattery ?? 0) : 0,
    building: known && ps.construction?.building === 'coastalBattery',
    nationColor: ps.owner === 'neutral' ? undefined : ownerColor(world, ps.owner),
  };
}

/**
 * Where a city's model puts things, in screen pixels from its centre. Land has no model (no sprite): its
 * armies stand round its anchor, clear of its name.
 */
interface CityFootprint {
  sprite: CitySprite | null;
  /** The city's port and its spot on the coast (map units). */
  port: { image: SpriteImage; x: number; y: number } | null;
  /** The built-up area's middle, and its half-width and half-depth: armies stand around it, the name plate lines up on it. */
  mid: Offset;
  half: Offset;
  /** Top edge of the buildings. */
  above: number;
  /** Front edge of the built-up area: the name plate hangs below it. */
  below: number;
}

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

export interface RoutePreview {
  target: MarchTarget;
  /** Cities still to reach, the last one only approached when the march ends on the road to it; null when it cannot get there. */
  path: ProvinceId[] | null;
  /** The provinces the march passes through and ends in. */
  provinces: ProvinceId[];
  ticks: number;
  /** Why there is no route. */
  blocked: string;
  /** The nation at peace with us that owns the destination, when an order there would first ask to declare war on it. */
  warOn?: NationId;
}

/** The route an army would take to a city or a spot on a road, with its arrival time (null for where it already is). */
export function routePreview(state: GameState, world: World, human: NationId, army: Army, target: MarchTarget): RoutePreview | null {
  const to = target.province;
  const road = target.road;
  if (!army.move?.leg && army.province === to && (road ? sameTarget(target, { province: to, road: army.road }) : !army.road)) return null;
  const owner = state.provinces[to].owner;
  const open = to === army.province || owner === human || owner === 'neutral' || atWar(state, human, owner);
  const plan = open ? planMarch(state, world, army, to, road) : null;
  if (!plan) {
    const none = { target, path: null, provinces: [], ticks: 0 };
    if (open) return { ...none, blocked: 'No route' };
    if (!checkDeclareWar(state, human, owner).ok) return { ...none, blocked: `Truce with ${nationName(world, owner)}` };
    return { ...none, blocked: `At peace with ${nationName(world, owner)}: declare war to enter`, warOn: owner };
  }
  const reached = plan.halt ? plan.path.slice(0, -1) : plan.path;
  const provinces = [...new Set([army.province, ...reached, to])];
  return { target, path: plan.path, provinces, ticks: plan.ticks, blocked: '' };
}

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

/**
 * Close up, past the zoom where the session's relief texture turns soft, sharper tiles of
 * the same relief are baked for the view once it settles and laid over it. Tiles already
 * baked at a coarser level stay underneath until the sharper ones arrive.
 */
function TerrainDetail({ geo, world, view, k }: { geo: MapGeometry; world: World; view: [number, number, number, number]; k: number }) {
  const [, bump] = useState(0);
  // Past 2 device pixels per screen pixel the extra sharpness is not worth the baking.
  const level = detailLevel(k * Math.min(2, window.devicePixelRatio || 1));
  const need = level ? tilesFor(geo, view, level) : [];
  const key = need.map((t) => t.key).join(' ');
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      for (const job of requestTiles(geo, world, need)) job.then((t) => live && t && bump((n) => n + 1));
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // The tile list is keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, world, key]);
  if (!level) return null;
  // Coarser tiles under the view, then this level's.
  const shown: TerrainTile[] = [];
  for (const l of DETAIL_LEVELS.filter((x) => x < level)) shown.push(...tilesFor(geo, view, l));
  shown.push(...need);
  return (
    <g className="terrain-detail" pointerEvents="none">
      {shown.map((t) => {
        const tex = bakedTile(t.key);
        return tex && <image key={t.key} href={tex.href} x={tex.x} y={tex.y} width={tex.width} height={tex.height} preserveAspectRatio="none" />;
      })}
    </g>
  );
}

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

/**
 * How a map view fills a province. The political view washes each power's land in its
 * colour lightly enough for the terrain to read through, and lights up your own; the
 * terrain view leaves the land almost bare. Borders carry the rest (BorderLayer).
 */
function tint(p: ProvinceLayerProps, id: ProvinceId, i: number, values: string[]): { fill: string; opacity: number } {
  const owner = p.ownerOf[id];
  const neutral = owner === 'neutral';
  const mine = owner === p.human;
  if (p.mode === 'morale') {
    // A foreign province's morale is unknown under the fog of war.
    if (neutral || values[i] === '') return { fill: ownerColor(p.world, owner), opacity: 0.1 };
    return { fill: moraleRamp(Number(values[i])), opacity: 0.62 };
  }
  // Land has no city to grow.
  if (p.mode === 'development') return values[i] === '' ? { fill: ownerColor(p.world, owner), opacity: 0.1 } : { fill: TIER_COLORS[Number(values[i])], opacity: 0.62 };
  if (p.mode === 'supply') {
    if (mine) return { fill: p.supplied[i] === '1' ? '#3fae5a' : '#e0473a', opacity: 0.5 };
    return { fill: ownerColor(p.world, owner), opacity: 0.1 };
  }
  const strength = p.mode === 'terrain' ? 0.3 : 1;
  if (mine) return { fill: vivid(ownerColor(p.world, owner), 0.6), opacity: 0.44 * strength };
  return { fill: ownerColor(p.world, owner), opacity: (neutral ? 0.18 : 0.3) * strength };
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

/**
 * Borders, from faint to bold: thin light lines between provinces (the lands round a city,
 * the city's own edge, and the regions); a band of each power's colour along the inside of
 * its frontier, under a light line with a dark casing between powers; a glowing white
 * outline round your own land; and the front, where your land meets a power at war with
 * you, in red.
 */
const BorderLayer = memo(function BorderLayer({
  geo,
  world,
  owners,
  ownerOf,
  human,
  enemies,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
  human: NationId;
  /** Nations at war with you, joined by ','. */
  enemies: string;
}) {
  // Each nation's outline is stroked wide in its colour and clipped to its own
  // territory, giving the band inside its border; the shared border sits on top.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const home = useMemo(() => geo.ownerOutline(human, (pid) => ownerOf[pid]), [geo, owners, human]);
  const front = useMemo(() => {
    const foes = new Set(enemies ? enemies.split(',') : []);
    const facing = (a: ProvinceId, b: ProvinceId) => ownerOf[a] === human && foes.has(ownerOf[b]);
    return foes.size ? geo.arcs((a, b) => b !== null && (facing(a, b) || facing(b, a))) : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, owners, human, enemies]);
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
      <path d={geo.landBorders} className="province-border land" />
      <path d={geo.cityBorders} className="province-border city" />
      <path d={geo.provinceBorders} className="province-border" />
      {outlines.map((o) => (
        <g key={o.id} clipPath={`url(#clip-own-${o.id})`}>
          <path d={o.d} className="nation-band wide" stroke={o.color} />
          <path d={o.d} className="nation-band" stroke={lighten(o.color, 0.2)} />
        </g>
      ))}
      <path d={geo.coastline} className="coastline" />
      <path d={nationBorders} className="nation-border-casing" />
      <path d={nationBorders} className="nation-border" />
      {home && (
        <g className="home-outline">
          <path d={home} className="home-glow wide" />
          <path d={home} className="home-glow" />
          <path d={home} className="home-line" />
        </g>
      )}
      {front && (
        <g className="front-line">
          <path d={front} className="front-glow" />
          <path d={front} className="front-core" />
        </g>
      )}
    </g>
  );
});

/**
 * The fog of war: land you cannot see lies under a dark veil and drifting cloud, its
 * armies, battles and buildings hidden. Its edge is where your sight ends.
 */
const FogLayer = memo(function FogLayer({ shape, edge, clouds }: { shape: string; edge: string; clouds: TerrainTexture | null }) {
  if (!shape) return null;
  return (
    <g className="fog-layer" pointerEvents="none">
      <clipPath id="fog-clip">
        <path d={shape} />
      </clipPath>
      <path d={shape} className="fog-veil" />
      {clouds && (
        <g clipPath="url(#fog-clip)">
          <image href={clouds.href} x={clouds.x} y={clouds.y} width={clouds.width} height={clouds.height} preserveAspectRatio="none" className="fog-clouds" />
        </g>
      )}
      <path d={edge} className="fog-edge" />
    </g>
  );
});

/**
 * Other powers' fronts: their borders with one another while at war, drawn faintly, so a glance shows who is
 * fighting whom. (Your own front is drawn by BorderLayer.)
 */
const OtherFrontsLayer = memo(function OtherFrontsLayer({
  geo,
  human,
  owners,
  wars,
  ownerOf,
}: {
  geo: MapGeometry;
  human: NationId;
  owners: string;
  /** Pairs at war, "a>b" with a before b, comma-separated. */
  wars: string;
  ownerOf: Record<ProvinceId, string>;
}) {
  const d = useMemo(() => {
    if (!wars) return '';
    const pairs = new Set(wars.split(','));
    const atWar = (a: OwnerId, b: OwnerId) => a !== human && b !== human && pairs.has(a < b ? `${a}>${b}` : `${b}>${a}`);
    return geo.arcs((a, b) => b !== null && ownerOf[a] !== ownerOf[b] && atWar(ownerOf[a], ownerOf[b]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, human, owners, wars]);
  return d ? <path d={d} className="front-line other" pointerEvents="none" /> : null;
});

/** What the pointer does on a road: points along it, clicks, right-clicks, or leaves it. */
type RoadAction = 'point' | 'click' | 'order' | 'leave';

const ConnectionLayer = memo(function ConnectionLayer({
  geo,
  world,
  focusIds,
  onRoad,
}: {
  geo: MapGeometry;
  world: World;
  focusIds: string;
  /** With one of your armies selected, the roads over land take the pointer: an army can be sent to any spot on one. */
  onRoad: ((action: RoadAction, e: React.MouseEvent<SVGLineElement>) => void) | null;
}) {
  const focus = new Set(focusIds ? focusIds.split(',') : []);
  return (
    <g className="connection-layer">
      <g pointerEvents="none">
        {world.scenario.connections.map((c) => {
          const [x1, y1] = geo.anchors[c.a];
          const [x2, y2] = geo.anchors[c.b];
          const active = focus.has(c.a) || focus.has(c.b);
          const sibling = world.provinces[c.a].around !== undefined && world.provinces[c.a].around === world.provinces[c.b].around;
          return (
            <line
              key={`${c.a}|${c.b}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={`connection ${c.kind}${sibling ? ' sibling' : ''}${active ? ' active' : ''}`}
            />
          );
        })}
      </g>
      {onRoad &&
        world.scenario.connections
          .filter((c) => isOpenRoad(world, c.a, c.b))
          .map((c) => {
            const [x1, y1] = geo.anchors[c.a];
            const [x2, y2] = geo.anchors[c.b];
            return (
              <line
                key={`hit-${c.a}|${c.b}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="road-hit"
                data-road={`${c.a}|${c.b}`}
                onMouseMove={(e) => onRoad('point', e)}
                onMouseLeave={(e) => onRoad('leave', e)}
                onClick={(e) => {
                  e.stopPropagation();
                  onRoad('click', e);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRoad('order', e);
                }}
              />
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
  ratio,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
  ratio: number;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labels = useMemo(() => nationLabels(geo, world, ownerOf), [geo, world, owners]);
  // Closer in, only cities are named (by their plates): unnamed land keeps the map clear.
  if (ratio >= ZOOM.nationNames) return null;
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

// ---------------------------------------------------------------------------
// Cities and objectives
// ---------------------------------------------------------------------------

const STAR = 'M0,-6 L1.8,-1.9 L6,-1.9 L2.6,0.8 L3.8,5 L0,2.5 L-3.8,5 L-2.6,0.8 L-6,-1.9 L-1.8,-1.9 Z';

/** An objective's victory points: a gold star and its value, so it never reads as an army's size. */
export function VpMarker({ vp }: { vp: number }) {
  return (
    <>
      <rect x={-8.6} y={-5.6} width={17.2} height={11.2} rx={5.6} />
      <path d={STAR} transform="translate(-3.4,0) scale(0.62)" />
      <text x={3.6} y={3.1}>
        {vp}
      </text>
    </>
  );
}

/** Width and height of a name plate, in screen pixels. */
const plateSize = (text: string, size: number): [number, number] => [text.length * size * 0.56 + 12, size + 5];

/**
 * A city's name plate (shown with its model), relative to the middle of its built-up area, in screen
 * pixels. Land carries no name, so armies there have nothing to keep clear of.
 */
function plateBox(world: World, id: ProvinceId, city: CityFootprint): PlateBox | undefined {
  const c = world.provinces[id].city;
  if (!c) return undefined;
  const [w, h] = plateSize(c.name, c.size === 'capital' ? 10.5 : 9.5);
  const top = city.below - 3 - city.mid[1];
  return { half: w / 2, top, bottom: top + h };
}

/** Dark label plate centred under a point (in screen pixels, before 1/k scaling). */
function Plate({ text, y, color, size = 10, className = '' }: { text: string; y: number; color?: string; size?: number; className?: string }) {
  const [w, h] = plateSize(text, size);
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

/** One of a model's images (a city's, or its port's) at its anchor, `px` screen pixels to the model unit. */
function ModelImage({ image, at: [x, y], k, px, fogged }: { image: SpriteImage; at: [number, number]; k: number; px: number; fogged?: boolean }) {
  return (
    <g transform={`translate(${x},${y}) scale(${1 / k})`} className={fogged ? 'fogged' : undefined}>
      <image href={image.href} x={-image.cx * px} y={-image.cy * px} width={image.width * px} height={image.height * px} />
    </g>
  );
}

/**
 * The cities' streets, lying on the map under the armies and the buildings; near the
 * sea or the edge of the map they stop at the coast.
 */
function CityGroundLayer({
  geo,
  world,
  k,
  ratio,
  cities,
  seen,
}: {
  geo: MapGeometry;
  world: World;
  k: number;
  ratio: number;
  cities: Record<ProvinceId, CityFootprint>;
  seen: ReadonlySet<ProvinceId>;
}) {
  const px = cityModelScale(ratio);
  const streets = (id: ProvinceId) => <ModelImage key={id} image={cities[id].sprite!.ground} at={geo.anchors[id]} k={k} px={px} fogged={!seen.has(id)} />;
  return (
    <g className="city-ground" pointerEvents="none">
      {world.cityIds.filter((id) => !geo.reach[id]).map(streets)}
      <g clipPath="url(#land-clip)">{world.cityIds.filter((id) => geo.reach[id]).map(streets)}</g>
    </g>
  );
}

/** The names of the cities drawn as models, over the armies standing round them (the plates take no clicks). */
function CityNameLayer({ geo, state, world, k, cities }: { geo: MapGeometry; state: GameState; world: World; k: number; cities: Record<ProvinceId, CityFootprint> }) {
  const s = 1 / k;
  return (
    <g className="city-layer city-names" pointerEvents="none">
      {world.cityIds.map((id) => {
        const def = world.provinces[id];
        const city = cities[id];
        const [x, y] = geo.anchors[id];
        const isCapital = def.city!.size === 'capital';
        return (
          <g key={id} transform={`translate(${x + city.mid[0] * s},${y}) scale(${s})`}>
            <Plate
              text={def.city!.name}
              y={city.below - 3}
              color={ownerColor(world, state.provinces[id].owner)}
              size={isCapital ? 10.5 : 9.5}
              className={isCapital ? 'capital' : ''}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Pointer handlers for a province, shared by its shape on the map and its city's marker or model. */
interface ProvinceHandlers {
  onClick: (pid: ProvinceId, e: React.MouseEvent) => void;
  onContext: (pid: ProvinceId, e: React.MouseEvent) => void;
  onHover: (pid: ProvinceId | null) => void;
}

/**
 * The cities: a marker growing with the city zoomed out, its 3D model closer in, each with any objective
 * badge and capture ring, and the land's towns as dots. A city is a small province: its marker or built-up
 * area answers a click or tap as well as its shape does, so it is easy to hit with a finger.
 */
function CityLayer({
  geo,
  state,
  world,
  k,
  ratio,
  cities,
  seen,
  handlers,
}: {
  geo: MapGeometry;
  state: GameState;
  world: World;
  k: number;
  ratio: number;
  cities: Record<ProvinceId, CityFootprint> | null;
  seen: ReadonlySet<ProvinceId>;
  handlers: ProvinceHandlers;
}) {
  const s = 1 / k;
  const px = cityModelScale(ratio);
  const hit = (id: ProvinceId) => ({
    'data-city': id,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      handlers.onClick(id, e);
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.stopPropagation();
      handlers.onContext(id, e);
    },
    onMouseEnter: () => handlers.onHover(id),
    onMouseLeave: () => handlers.onHover(null),
  });
  return (
    <g className="city-layer">
      {ratio >= ZOOM.townDots && (
        <g pointerEvents="none">
          {world.provinceIds.map((id) =>
            geo.towns[id].map((t) => <circle key={`${id}-${t.name}`} cx={t.x} cy={t.y} r={1.8 * s} className="town-dot" />),
          )}
        </g>
      )}
      {cities &&
        world.cityIds.map((id) => {
          const port = cities[id].port;
          return port && <ModelImage key={`port-${id}`} image={port.image} at={[port.x, port.y]} k={k} px={px} fogged={!seen.has(id)} />;
        })}
      {world.cityIds.map((id) => {
        const def = world.provinces[id];
        const [x, y] = geo.anchors[id];
        const ps = state.provinces[id];
        // Under the fog of war nobody reports a siege.
        const capture = seen.has(id) ? ps.capture : null;
        const fogged = !seen.has(id);
        const size = def.city!.size;
        const isCapital = size === 'capital';
        // Markers grow with the city: tier 1 (town) to tier 5 (world city).
        const tierScale = 0.76 + ps.tier * 0.12;
        const showName = isCapital ? ratio >= ZOOM.capitals : size === 'major' ? ratio >= ZOOM.majorCities : ratio >= ZOOM.towns;
        const city = cities?.[id];
        if (city?.sprite) {
          const sp = city.sprite;
          const st = sp.structures;
          // The capture ring circles the built-up area.
          const [cx, cy] = city.mid;
          const [rx, ry] = [city.half[0] + 1.5 * px, city.half[1] + px];
          return (
            <g key={id} transform={`translate(${x},${y}) scale(${s})`} data-city-model={id} className={fogged ? 'fogged' : undefined}>
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="city-hit" {...hit(id)} />
              <image href={st.href} x={-st.cx * px} y={-st.cy * px} width={st.width * px} height={st.height * px} pointerEvents="none" />
              {capture && (
                <g className="capture" pointerEvents="none">
                  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="capture-track" />
                  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="capture-ring" stroke={world.nations[capture.by]?.color} pathLength={100} strokeDasharray={`${(capture.progress / capture.required) * 100} 100`} />
                </g>
              )}
              {def.objectiveVp ? (
                <g className="vp-badge-map" transform={`translate(${cx + city.half[0] + 7},${-sp.back * px * 0.3})`} pointerEvents="none">
                  <VpMarker vp={def.objectiveVp} />
                </g>
              ) : null}
            </g>
          );
        }
        return (
          <g key={id} transform={`translate(${x},${y}) scale(${s})`} className={fogged ? 'fogged' : undefined}>
            <circle r={isCapital ? 14 : 12} className="city-hit" {...hit(id)} />
            <g pointerEvents="none">
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
                <g className="vp-badge-map" transform={`translate(${isCapital ? 14 : 12},1)`}>
                  <VpMarker vp={def.objectiveVp} />
                </g>
              ) : null}
              {showName && (
                <Plate
                  text={def.city!.name}
                  y={isCapital ? 8.5 : 6.5}
                  color={ownerColor(world, ps.owner)}
                  size={isCapital ? 10.5 : 9.5}
                  className={isCapital ? 'capital' : ''}
                />
              )}
            </g>
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
  if (!leg) return army.road ? roadPoint(geo, army.province, army.road) : geo.anchors[army.province];
  const t = Math.min(1, (leg.elapsed + alpha) / leg.duration);
  const [x1, y1] = geo.anchors[leg.from];
  const [x2, y2] = geo.anchors[leg.to];
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

/**
 * The points of a march from where the army is through the cities on its path, ending at the
 * spot on a road where it halts, if it does: there, short of the last city.
 */
function marchLine(geo: MapGeometry, army: Army, path: ProvinceId[], halt?: RoadHalt, from = armyPosition(geo, army, 0)): [number, number][] {
  const pts: [number, number][] = [from, ...path.map((pid) => geo.anchors[pid])];
  if (halt && path.length > 0) pts[pts.length - 1] = roadPoint(geo, halt.province, halt);
  return pts;
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

/** Marching on an army: to the spot where it stands (on a road, perhaps), or where it is about to arrive. */
function armyMarchTarget(army: Army): MarchTarget {
  return army.move?.leg || !army.road ? { province: armyTarget(army) } : { province: army.province, road: army.road };
}

/** Where a standing army is: its city, or its spot on a road out of it. */
function spotKey(army: Army): string {
  return army.road ? `${army.province}>${army.road.toward}@${army.road.at}` : army.province;
}

/** Stationary counters sit above their city in rows of two (screen pixels). */
const STACK = { base: 19, row: 27, half: 23 };

/** Army ids by creation order: "a9" before "a10". */
function byCreation(a: Army, b: Army): number {
  return Number(a.id.slice(1)) - Number(b.id.slice(1)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** A marching army's remaining road, from where it is now, with an arrowhead at the destination (a city, or a spot on a road). */
function Route({ geo, army, x, y, k, own, selected }: { geo: MapGeometry; army: Army; x: number; y: number; k: number; own: boolean; selected: boolean }) {
  const pts = marchLine(geo, army, army.move?.path ?? [], army.move?.halt, [x, y]);
  if (pts.length < 2) return null;
  const [ex, ey] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const angle = (Math.atan2(ey - py, ex - px) * 180) / Math.PI;
  const line = pts.map((p) => p.join(',')).join(' ');
  return (
    <g className={`route${selected ? ' selected' : ''}${own ? '' : ' foreign'}`}>
      <polyline points={line} className="route-casing" />
      <polyline points={line} className="route-line" />
      <path d="M-8,-5 L1,0 L-8,5 Z" transform={`translate(${ex},${ey}) rotate(${angle}) scale(${1 / k})`} className="route-head" />
    </g>
  );
}

/** A pulsing explosion over every province in sight with a battle in it. */
function Battles({ geo, state, k, seen }: { geo: MapGeometry; state: GameState; k: number; seen: ReadonlySet<ProvinceId> }) {
  return (
    <>
      {Object.keys(state.battles).filter((pid) => seen.has(pid)).map((pid) => {
        const [x, y] = geo.anchors[pid];
        return (
          <g key={`b-${pid}`} transform={`translate(${x + 17 / k},${y - 4 / k}) scale(${1 / k})`} className="battle-fx" pointerEvents="none">
            <circle r={12} className="battle-pulse" />
            <path d={BURST_OUTER} className="battle-burst" />
            <path d={BURST_INNER} className="battle-core" />
          </g>
        );
      })}
    </>
  );
}

function ArmyMarker({
  army,
  world,
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
  world: World;
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
  return (
    <g
      transform={`translate(${x},${y}) scale(${1 / k})`}
      className={`army-marker${selected ? ' selected' : ''}${own ? ' own' : ''}${hostile ? ' hostile' : ''}${army.supplied ? '' : ' unsupplied'}`}
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
      <CounterArt world={world} type={main} gen={unitGen(state, army.owner, main)} nation={army.owner} x={-19.5} y={-8.6} width={23} />
      <text x={12.2} y={4.7} className="army-count">
        {army.units.length}
      </text>
      <rect x={-21} y={10.6} width={42} height={6.2} rx={1.6} className="army-hp-bg" />
      <rect x={-21} y={10.6} width={42 * avg} height={3} rx={1.5} fill={strengthColor(avg)} />
      <rect x={-21} y={14} width={42 * morale} height={2.6} rx={1.3} className={`army-morale ${morale >= 0.6 ? 'high' : morale >= 0.35 ? 'mid' : 'low'}`} />
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
  panning,
  selectedArmies,
  onArmyClick,
  onArmyContext,
  onHover,
}: {
  ctrl: GameController;
  geo: MapGeometry;
  k: number;
  panning: RefObject<boolean>;
  selectedArmies: ArmyId[];
  onArmyClick: (army: Army, additive: boolean) => void;
  onArmyContext: (army: Army) => void;
  onHover: (pid: ProvinceId | null, army?: ArmyId) => void;
}) {
  useArmyClock(ctrl, panning);
  const { state, human, world } = ctrl;
  const alpha = ctrl.loop.paused ? 0 : ctrl.loop.alpha;
  const selected = new Set(selectedArmies);
  const relations = state.nations[human].relations;
  const seen = ctrl.sight();
  const armies = Object.values(state.armies)
    .filter((a) => isArmyVisible(a, human, seen))
    .sort(byCreation);

  // Armies standing in a city (or at one spot on a road) fill rows of two above it, yours first,
  // so a crowded province grows a short pyramid rather than a tower over its neighbours.
  const stacks = new Map<string, Army[]>();
  for (const a of armies) {
    if (isArmyInTransit(a)) continue;
    const list = stacks.get(spotKey(a)) ?? [];
    list.push(a);
    stacks.set(spotKey(a), list);
  }
  const offsets = new Map<ArmyId, [number, number]>();
  for (const [, list] of stacks) {
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
    if (army.move && (own || selected.has(army.id))) routes.push(<Route key={`r-${army.id}`} geo={geo} army={army} x={x} y={y} k={k} own={own} selected={selected.has(army.id)} />);
    const hostile = army.owner !== 'neutral' && !own && relations[army.owner]?.status === 'war';
    markers.push(
      <ArmyMarker
        key={army.id}
        army={army}
        world={world}
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

  return (
    <g className="army-layer">
      <g pointerEvents="none">{routes}</g>
      {markers}
      <Battles geo={geo} state={state} k={k} seen={seen} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// 3D armies (wherever the cities are 3D models)
// ---------------------------------------------------------------------------

/** Screen pixels per model unit for the 3D armies. Like the cities, they grow more slowly than the map. */
export function unitModelScale(ratio: number): number {
  return Math.min(20, 2.5 + 5 * ratio);
}

/**
 * The army layers' clock. While an army is marching they redraw every animation frame, so marches glide;
 * otherwise once a game tick. While the map is being dragged or pinched they wait, so moving the map
 * comes first, and catch up when it is let go.
 */
function useArmyClock(ctrl: GameController, panning: RefObject<boolean>): void {
  const last = useRef(0);
  useSyncExternalStore(ctrl.subscribeFrame, () => {
    if (panning.current) return last.current;
    const marching = Object.values(ctrl.state.armies).some((a) => a.move?.leg);
    last.current = ctrl.state.tick * 1000 + (marching ? Math.floor(ctrl.loop.alpha * 1000) : 0);
    return last.current;
  });
}

/** While a pinch or wheel zoom lasts, the map is redrawn for the new scale at most this often (ms). */
const RESCALE_MS = 120;

/** How long an army takes to walk to a new spot (arriving, setting off, making room). */
const SETTLE_MS = 450;

/** Room one army takes around its ground point, in screen pixels. */
const armyRoom = (px: number) => px * 1.45;

interface PlacedArmy {
  army: Army;
  /** Ground point, in map coordinates. */
  x: number;
  y: number;
  heading: number;
  model: UnitType | 'transport';
  /** The spot or road the army is tied to: when it changes, the army walks over instead of jumping. */
  key: string;
  marching: boolean;
  /** The city it stands by or is nearest on its road. */
  near: ProvinceId;
}

/**
 * Where every army stands: in spots around its city (yours first), or on the road
 * between two cities' edges, abreast when several share it, facing the way it goes.
 */
function placeArmies(
  state: GameState,
  world: World,
  geo: MapGeometry,
  human: NationId,
  seen: ReadonlySet<ProvinceId>,
  k: number,
  px: number,
  alpha: number,
  cities: Record<ProvinceId, CityFootprint>,
): PlacedArmy[] {
  const room = armyRoom(px);
  const stands = new Map<ProvinceId, Army[]>();
  const roads = new Map<string, Army[]>();
  const halted = new Map<string, Army[]>();
  for (const a of Object.values(state.armies).sort(byCreation)) {
    if (!isArmyVisible(a, human, seen)) continue;
    const leg = a.move?.leg;
    const [map, key] = leg ? [roads, `${leg.from}>${leg.to}`] : a.road ? [halted, spotKey(a)] : [stands, a.province];
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  const out: PlacedArmy[] = [];
  const mainModel = (a: Army) => mainUnitType(composition(a));
  for (const [pid, list] of stands) {
    const [ax, ay] = geo.anchors[pid];
    const [mx, my] = cities[pid].mid;
    const battle = !!state.battles[pid];
    list.sort((a, b) => Number(b.owner === human) - Number(a.owner === human) || byCreation(a, b));
    const spots = citySpots(cities[pid].half, room, list.length, plateBox(world, pid, cities[pid]));
    // The spots start on the left; a city crowded on that side starts on the right.
    const side = -geo.campSide[pid];
    list.forEach((army, i) => {
      const [ox, oy] = [spots[i][0] * side, spots[i][1]];
      // At rest they face out of the screen, to whichever side they stand; in a battle, the fighting.
      const heading = battle ? headingFor(-ox, -oy) : ox < 0 ? 4 : 0;
      out.push({ army, x: ax + (mx + ox) / k, y: ay + (my + oy) / k, heading, model: mainModel(army), key: `${pid}#${i}`, marching: false, near: pid });
    });
  }
  // Halted on a road: where the order put it, but never inside a city's built-up area; several abreast.
  for (const [spot, list] of halted) {
    list.sort((a, b) => Number(b.owner === human) - Number(a.owner === human) || byCreation(a, b));
    list.forEach((army, i) => {
      const province = army.province;
      const road = army.road!;
      const [x1, y1] = geo.anchors[province];
      const [x2, y2] = geo.anchors[road.toward];
      const [dx, dy] = [x2 - x1, y2 - y1];
      const len = Math.hypot(dx, dy) * k || 1;
      const [from, to] = [cities[province], cities[road.toward]];
      const [[sx, sy], [ex, ey]] = roadEnds(dx, dy, from.half, to.half, room, len);
      // How far along the road (0..1) each city's edge lies.
      const near = Math.hypot(from.mid[0] + sx, from.mid[1] + sy) / len;
      const far = 1 - Math.hypot(to.mid[0] + ex, to.mid[1] + ey) / len;
      const t = Math.min(Math.max(road.at, near), Math.max(near, far));
      const side = (i - (list.length - 1) / 2) * room * 1.4;
      const battle = !!state.battles[province];
      // Looking on down the road, or back to the fighting in its province.
      const heading = battle ? headingFor(-dx, -dy) : headingFor(dx, dy);
      out.push({
        army,
        x: x1 + dx * t - (dy * side) / len,
        y: y1 + dy * t + (dx * side) / len,
        heading,
        model: mainModel(army),
        key: `${spot}#${i}/${list.length}`,
        marching: false,
        near: t < 0.5 ? province : road.toward,
      });
    });
  }
  for (const [road, list] of roads) {
    list.forEach((army, i) => {
      const leg = army.move!.leg!;
      const t = Math.min(1, (leg.elapsed + alpha) / leg.duration);
      const [x1, y1] = geo.anchors[leg.from];
      const [x2, y2] = geo.anchors[leg.to];
      const [dx, dy] = [x2 - x1, y2 - y1];
      const len = Math.hypot(dx, dy) * k || 1;
      // From the edge of one built-up area to the edge of the next.
      const [from, to] = [cities[leg.from], cities[leg.to]];
      const [[sx, sy], [ex, ey]] = roadEnds(dx, dy, from.half, to.half, room, len);
      const [fx, fy, tx, ty] = [from.mid[0] + sx, from.mid[1] + sy, to.mid[0] + ex, to.mid[1] + ey];
      // Several armies on one road march abreast.
      const side = (i - (list.length - 1) / 2) * room * 1.4;
      const ox = fx + (tx - fx) * t - (dy * k * side) / len;
      const oy = fy + (ty - fy) * t + (dx * k * side) / len;
      const sea = connectionBetween(world, leg.from, leg.to)?.kind === 'strait';
      out.push({
        army,
        x: x1 + dx * t + ox / k,
        y: y1 + dy * t + oy / k,
        heading: headingFor(dx, dy),
        model: sea ? 'transport' : mainModel(army),
        key: `${road}#${i}/${list.length}`,
        marching: true,
        near: t < 0.5 ? leg.from : leg.to,
      });
    });
  }
  return out;
}

interface Motion {
  key: string;
  from: [number, number];
  start: number;
  shown: [number, number];
}

/** Foot soldiers and horses bob as they march; vehicles roll. */
const BOBS = new Set<string>(['infantry', 'stormtroopers', 'mountain', 'cavalry']);

function ArmyModelLayer({
  ctrl,
  geo,
  k,
  px,
  cities,
  back,
  panning,
  selectedArmies,
  onArmyClick,
  onArmyContext,
  onHover,
}: {
  ctrl: GameController;
  geo: MapGeometry;
  k: number;
  panning: RefObject<boolean>;
  /** Screen pixels per model unit. */
  px: number;
  cities: Record<ProvinceId, CityFootprint>;
  /** Layer under the cities, for models standing behind one (their badges stay on top). */
  back: SVGGElement | null;
  selectedArmies: ArmyId[];
  onArmyClick: (army: Army, additive: boolean) => void;
  onArmyContext: (army: Army) => void;
  onHover: (pid: ProvinceId | null, army?: ArmyId) => void;
}) {
  useArmyClock(ctrl, panning);
  // While paused, armies still finish walking to new spots.
  const [, bump] = useState(0);
  const motion = useRef(new Map<ArmyId, Motion>());
  const { state, world, human } = ctrl;
  const paused = ctrl.loop.paused;
  const selected = new Set(selectedArmies);
  const relations = state.nations[human].relations;
  const seen = ctrl.sight();
  const placed = placeArmies(state, world, geo, human, seen, k, px, paused ? 0 : ctrl.loop.alpha, cities);

  const now = performance.now();
  let settling = false;
  const live = new Set<ArmyId>();
  for (const p of placed) {
    live.add(p.army.id);
    const m = motion.current.get(p.army.id);
    if (!m) {
      motion.current.set(p.army.id, { key: p.key, from: [p.x, p.y], start: -Infinity, shown: [p.x, p.y] });
      continue;
    }
    if (m.key !== p.key) {
      m.from = m.shown;
      m.start = now;
      m.key = p.key;
    }
    const t = Math.min(1, (now - m.start) / SETTLE_MS);
    if (t < 1) {
      settling = true;
      const e = 1 - (1 - t) ** 3;
      p.x = m.from[0] + (p.x - m.from[0]) * e;
      p.y = m.from[1] + (p.y - m.from[1]) * e;
    }
    m.shown = [p.x, p.y];
  }
  for (const id of motion.current.keys()) if (!live.has(id)) motion.current.delete(id);
  useEffect(() => {
    if (!settling || !paused) return;
    const f = requestAnimationFrame(() => bump((n) => n + 1));
    return () => cancelAnimationFrame(f);
  });

  // Nearer the bottom of the screen is nearer the viewer: drawn later.
  placed.sort((a, b) => a.y - b.y || byCreation(a.army, b.army));
  const room = armyRoom(px);
  // Every city's name plate on screen (map units), so a badge that lands on one can step clear of it.
  const plates = world.cityIds.map((id) => {
    const b = plateBox(world, id, cities[id])!;
    const [x, y] = [geo.anchors[id][0] + cities[id].mid[0] / k, geo.anchors[id][1] + cities[id].mid[1] / k];
    return { x0: x - b.half / k, x1: x + b.half / k, y0: y + b.top / k, y1: y + b.bottom / k };
  });
  const routes: ReactNode[] = [];
  const models: ReactNode[] = [];
  const behind: ReactNode[] = [];
  const badges: [boolean, ReactNode][] = [];
  for (const p of placed) {
    const { army } = p;
    const own = army.owner === human;
    const sel = selected.has(army.id);
    const hostile = army.owner !== 'neutral' && !own && relations[army.owner]?.status === 'war';
    if (army.move && (own || sel)) routes.push(<Route key={`r-${army.id}`} geo={geo} army={army} x={p.x} y={p.y} k={k} own={own} selected={sel} />);
    const gen = unitGen(state, army.owner, p.model === 'transport' ? mainUnitType(composition(army)) : p.model);
    const sprite = unitSprite(world, p.model, gen, army.owner, p.heading);
    const bob = p.marching && !paused && BOBS.has(p.model) ? -Math.abs(Math.sin(now / 140 + Number(army.id.slice(1)))) * 1.3 : 0;
    const [left, top, w, h] = [-sprite.cx * px, -sprite.cy * px + bob, sprite.width * px, sprite.height * px];
    const handlers = {
      'data-army': army.id,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onArmyClick(army, e.shiftKey);
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onArmyContext(army);
      },
      onMouseEnter: () => onHover(armyTarget(army), army.id),
      onMouseLeave: () => onHover(null),
    };
    const status = `${sel ? ' selected' : ''}${own ? ' own' : ''}${hostile ? ' hostile' : ''}${army.supplied ? '' : ' unsupplied'}`;
    const transform = `translate(${p.x},${p.y}) scale(${1 / k})`;
    // The hit area comes first: it is what scripts and touch aim for.
    const hw = Math.max(13, w / 2, room * 0.9);
    // Standing behind a city, a model goes under it (the city's buildings hide its feet).
    const near = cities[p.near];
    const [cx, cy] = [geo.anchors[p.near][0] + near.mid[0] / k, geo.anchors[p.near][1] + near.mid[1] / k];
    const hidden = back && (p.y - cy) * k < -2 && Math.abs(p.x - cx) * k < near.half[0] + room;
    (hidden ? behind : models).push(
      <g key={army.id} transform={transform} className={`army-model${status}`} {...handlers}>
        <rect x={-hw} y={Math.min(top, -26)} width={hw * 2} height={Math.max(top + h, room * 0.5) - Math.min(top, -26)} className="army-hit" />
        {p.model !== 'transport' && <ellipse rx={room} ry={room / 2} className="army-ring" fill={ownerColor(world, army.owner)} />}
        {sel && <ellipse rx={room * 1.22} ry={room * 0.61} className="army-select-ring" />}
        <image href={sprite.href} x={left} y={top} width={w} height={h} />
      </g>,
    );
    badges.push([
      sel,
      <ArmyBadge key={army.id} army={army} y={top - 3 + badgeShift(army, p.x, p.y + (top - 3) / k, k, plates)} transform={transform} status={status} handlers={handlers} />,
    ]);
  }
  // The selection's badges go on top, so they can always be clicked.
  badges.sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <g className="army-layer army-models">
      {back && createPortal(behind, back)}
      <g pointerEvents="none">{routes}</g>
      {models}
      <Battles geo={geo} state={state} k={k} seen={seen} />
      {badges.map((b) => b[1])}
    </g>
  );
}

/** Width of an army's badge, in screen pixels. */
const badgeWidth = (army: Army) => 21 + String(army.units.length).length * 6.6;
const BADGE_HEIGHT = 19;

/**
 * How far (screen pixels) to move an army's badge, whose bottom edge is at (x, bottom) in map units, so
 * it does not sit on a city's name plate: up or down, whichever is the shorter step, and only a short one.
 */
function badgeShift(army: Army, x: number, bottom: number, k: number, plates: { x0: number; x1: number; y0: number; y1: number }[]): number {
  const half = badgeWidth(army) / 2 / k;
  const top = bottom - BADGE_HEIGHT / k;
  let shift = 0;
  for (const pl of plates) {
    if (x + half <= pl.x0 || x - half >= pl.x1 || bottom + shift <= pl.y0 || top + shift >= pl.y1) continue;
    const up = (bottom + shift - pl.y0) * k + 2;
    const down = (pl.y1 - top - shift) * k + 2;
    const step = up <= down ? -up : down;
    if (Math.abs(step) > 28) continue;
    shift += step / k;
  }
  return shift * k;
}

/** An army's label over its model: flag, number of formations, strength and morale. */
function ArmyBadge({
  army,
  y,
  transform,
  status,
  handlers,
}: {
  army: Army;
  y: number;
  transform: string;
  status: string;
  handlers: object;
}) {
  const count = String(army.units.length);
  const w = badgeWidth(army);
  const strength = composition(army).strength;
  const morale = armyMorale(army);
  return (
    <g transform={transform} className={`army-marker army-badge3d${status}`} {...handlers}>
      <g transform={`translate(0,${y})`}>
        <rect x={-w / 2} y={-19} width={w} height={13} rx={3} fill={`url(#ag-${army.owner})`} className="army-body" />
        <FlagMark id={flagKey(army.owner, army.province)} x={-w / 2 + 2.5} y={-16.5} height={8} />
        <text x={-w / 2 + 16} y={-8.6} className="army-count">
          {count}
        </text>
        <rect x={-w / 2} y={-5.4} width={w} height={5.2} rx={1.4} className="army-hp-bg" />
        <rect x={-w / 2} y={-5.4} width={w * strength} height={2.5} rx={1.2} fill={strengthColor(strength)} />
        <rect x={-w / 2} y={-2.6} width={w * morale} height={2.3} rx={1.1} className={`army-morale ${morale >= 0.6 ? 'high' : morale >= 0.35 ? 'mid' : 'low'}`} />
        {!army.supplied && (
          <g transform={`translate(${w / 2 + 1},-19)`} className="army-badge warn">
            <circle r={5} />
            <text y={2.9}>!</text>
          </g>
        )}
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

/** The overview map stays hidden until its button opens it; this browser remembers the choice. */
const OVERVIEW_KEY = 'world-conflict:overview-map';
function overviewShown(): boolean {
  try {
    return window.localStorage.getItem(OVERVIEW_KEY) === 'shown';
  } catch {
    return false;
  }
}
function rememberOverview(shown: boolean): void {
  try {
    window.localStorage.setItem(OVERVIEW_KEY, shown ? 'shown' : 'hidden');
  } catch {
    // Storage unavailable: the choice lasts until the page closes.
  }
}

const MiniMapBase = memo(function MiniMapBase({
  geo,
  world,
  owners,
  ownerOf,
  human,
  fog,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
  human: NationId;
  /** The land under the fog of war, as one shape. */
  fog: string;
}) {
  // Only the countries around the theatre are visible in the overview.
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const near = geo.countries.filter((c) => c.bounds[1][0] > bx0 - 200 && c.bounds[0][0] < bx1 + 200 && c.bounds[1][1] > by0 - 200 && c.bounds[0][1] < by1 + 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const home = useMemo(() => geo.ownerOutline(human, (pid) => ownerOf[pid]), [geo, owners, human]);
  return (
    <g data-owners={owners}>
      {near.map((c) => (
        <path key={c.iso + c.name} d={c.d} className="mm-country" />
      ))}
      {world.provinceIds.map((id) => (
        <path key={id} d={geo.provincePaths[id]} fill={ownerColor(world, ownerOf[id])} className="mm-province" />
      ))}
      {fog && <path d={fog} className="mm-fog" />}
      <path d={home} className="mm-home" />
    </g>
  );
});

function MiniMap({
  geo,
  world,
  owners,
  ownerOf,
  human,
  fog,
  view,
  onNavigate,
}: {
  geo: MapGeometry;
  world: World;
  owners: string;
  ownerOf: Record<ProvinceId, string>;
  human: NationId;
  fog: string;
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
        <MiniMapBase geo={geo} world={world} owners={owners} ownerOf={ownerOf} human={human} fog={fog} />
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

function fitFor(width: number, height: number, inset: number, insetBottom: number) {
  const usable = Math.max(240, width - inset);
  const usableH = Math.max(160, height - insetBottom);
  const k = Math.min(usable / MAP_WIDTH, usableH / MAP_HEIGHT);
  return { k, transform: zoomIdentity.translate((usable - MAP_WIDTH * k) / 2, (usableH - MAP_HEIGHT * k) / 2).scale(k) };
}

/**
 * Opening view: the player's own territory, somewhat closer than the whole theatre and
 * framed above the field reports (bottom left), which would otherwise hide Iberia.
 * A phone opens closer still, on the capital.
 */
function homeView(
  geo: MapGeometry,
  pids: ProvinceId[],
  capital: ProvinceId,
  compact: boolean,
  width: number,
  height: number,
  inset: number,
  insetBottom: number,
): ZoomTransform {
  const fit = fitFor(width, height, inset, insetBottom);
  if (compact) {
    const k = Math.max(fit.k, MIN_ZOOM_BASE * COMPACT_OPENING);
    const [x, y] = geo.anchors[capital];
    return zoomIdentity.translate(Math.max(240, width - inset) / 2 - x * k, Math.max(240, height - insetBottom) / 2 - y * k).scale(k);
  }
  if (pids.length === 0) return fit.transform;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pid of pids) {
    const [[a, b], [c, d]] = geo.provinceBounds[pid];
    [x0, y0, x1, y1] = [Math.min(x0, a), Math.min(y0, b), Math.max(x1, c), Math.max(y1, d)];
  }
  const w = Math.max(240, width - inset);
  // A bottom panel takes the place of the field reports.
  const h = Math.max(240, insetBottom ? height - insetBottom : height * 0.68);
  const k = Math.max(fit.k, Math.min(Math.max(fit.k, MIN_ZOOM_BASE) * 1.6, 0.7 * Math.min(w / (x1 - x0), h / (y1 - y0))));
  return zoomIdentity.translate(w / 2 - ((x0 + x1) / 2) * k, h / 2 - ((y0 + y1) / 2) * k).scale(k);
}

export function MapView(props: MapViewProps) {
  const { ctrl, geo } = props;
  const { world, state, human } = ctrl;
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const insetRef = useRef(props.insetRight);
  insetRef.current = props.insetRight;
  const insetBottomRef = useRef(props.insetBottom);
  insetBottomRef.current = props.insetBottom;
  const compactRef = useRef(props.compact);
  compactRef.current = props.compact;
  // The view the map is drawn for (`transform`), and the one on screen right now (`live`). A pan only
  // moves the picture: the zoom handler sets the map group's transform itself, and React draws again
  // when the gesture ends. A change of scale redraws the counters, labels and models for the new zoom
  // as well, at most every RESCALE_MS while it lasts.
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const live = useRef<ZoomTransform>(zoomIdentity);
  const viewRef = useRef<SVGGElement>(null);
  // Whether a drag, pinch, wheel or animated move of the map is under way.
  const panning = useRef(false);
  const [fitK, setFitK] = useState(1);
  const [size, setSize] = useState<[number, number]>([1, 1]);
  const [hovered, setHovered] = useState<ProvinceId | null>(null);
  /** Pointing at one of the selected armies themselves: no route to preview. */
  const [hoverSelf, setHoverSelf] = useState(false);
  /** The spot on a road under the pointer (or the city at its end), while one of your armies is selected. */
  const [hoverRoad, setHoverRoad] = useState<MarchTarget | null>(null);
  const [texture, setTexture] = useState<TerrainTexture | null>(null);
  const [glow, setGlow] = useState<TerrainTexture | null>(null);
  const [clouds, setClouds] = useState<TerrainTexture | null>(null);
  const [armyBack, setArmyBack] = useState<SVGGElement | null>(null);
  const [overview, setOverview] = useState(overviewShown);

  useEffect(() => {
    let live = true;
    terrainTexture(geo, world).then((t) => live && setTexture(t));
    seaGlowTexture(geo).then((t) => live && setGlow(t));
    fogTexture(geo).then((t) => live && setClouds(t));
    return () => {
      live = false;
    };
  }, [geo, world]);

  // Build every city's model, and every army's at rest, in idle moments, so the first zoom-in does not stall.
  useEffect(() => {
    const seen = ctrl.sight();
    const jobs: (() => void)[] = world.cityIds.map((id) => () => void citySprite(cityModelProps(ctrl.state, world, geo, id, seen.has(id))));
    for (const a of Object.values(ctrl.state.armies)) {
      const type = mainUnitType(composition(a));
      for (const heading of [0, 4]) jobs.push(() => void unitSprite(ctrl.world, type, unitGen(ctrl.state, a.owner, type), a.owner, heading));
    }
    let next = 0;
    let timer = 0;
    const step = () => {
      const until = performance.now() + 6;
      while (next < jobs.length && performance.now() < until) jobs[next++]();
      if (next < jobs.length) timer = window.setTimeout(step, 40);
    };
    timer = window.setTimeout(step, 400);
    return () => window.clearTimeout(timer);
  }, [ctrl, world, geo]);

  // Zoom & pan.
  useEffect(() => {
    const svg = svgRef.current!;
    const { width, height } = svg.getBoundingClientRect();
    const fit = fitFor(width, height, insetRef.current, insetBottomRef.current);
    const [[x0, y0], [x1, y1]] = geo.worldBounds;
    const minK = Math.max(0.05, Math.min(width / (x1 - x0), height / (y1 - y0)));
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minK, Math.max(fit.k, MIN_ZOOM_BASE) * MAX_ZOOM])
      .translateExtent([
        [x0, y0],
        [x1, y1],
      ])
      .clickDistance(5)
      // Shift-drag draws a selection box instead of panning.
      .filter((e: MouseEvent) => (!e.ctrlKey || e.type === 'wheel') && !e.button && !(e.shiftKey && e.type === 'mousedown'))
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        live.current = e.transform;
        viewRef.current?.setAttribute('transform', e.transform.toString());
        if (!panning.current) commit();
        else if (e.transform.k !== drawnK && !rescale) rescale = window.setTimeout(commit, RESCALE_MS);
      })
      .on('start', () => {
        panning.current = true;
      })
      .on('end', () => {
        panning.current = false;
        commit();
      });
    let drawnK = 0;
    let rescale = 0;
    const commit = () => {
      window.clearTimeout(rescale);
      rescale = 0;
      drawnK = live.current.k;
      setTransform(live.current);
    };
    zoomRef.current = behavior;
    setFitK(fit.k);
    setSize([width, height]);
    const sel = select(svg);
    sel.call(behavior).on('dblclick.zoom', null);
    const home = world.provinceIds.filter((id) => ctrl.state.provinces[id].owner === ctrl.human);
    const capital = world.nations[ctrl.human].capital;
    sel.call(behavior.transform, homeView(geo, home, capital, compactRef.current, width, height, insetRef.current, insetBottomRef.current));
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      setSize([r.width, r.height]);
    });
    ro.observe(svg);
    return () => {
      ro.disconnect();
      window.clearTimeout(rescale);
      sel.on('.zoom', null);
    };
  }, [geo, world, ctrl]);

  const centreOn = useCallback((x: number, y: number, k: number | null, duration: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    const { width, height } = svg.getBoundingClientRect();
    const cx = Math.max(120, width - insetRef.current) / 2;
    const cy = Math.max(120, height - insetBottomRef.current) / 2;
    const sel = select(svg);
    if (k === null) {
      if (duration) sel.transition().duration(duration).call(behavior.translateTo, x, y, [cx, cy]);
      else sel.call(behavior.translateTo, x, y, [cx, cy]);
      return;
    }
    sel
      .transition()
      .duration(duration)
      .call(behavior.transform, zoomIdentity.translate(cx - x * k, cy - y * k).scale(k));
  }, []);

  // Centre on a province when requested (e.g. clicking an event). Selecting one never moves the map.
  useEffect(() => {
    if (!props.focus) return;
    const [x, y] = geo.anchors[props.focus.province];
    centreOn(x, y, Math.max(transform.k, fitK * 2.2), 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.seq]);

  // Arrow keys pan the map (Shift for bigger steps), unless a window is open.
  useEffect(() => {
    const PAN: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const onKey = (e: KeyboardEvent) => {
      const dir = PAN[e.key];
      if (!dir || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.querySelector('.modal-backdrop, .tutorial-backdrop')) return;
      const svg = svgRef.current;
      const behavior = zoomRef.current;
      if (!svg || !behavior) return;
      e.preventDefault();
      const step = (e.shiftKey ? 260 : 90) / zoomTransform(svg).k;
      select(svg).call(behavior.translateBy, dir[0] * step, dir[1] * step);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Shift-drag: a box that selects your armies inside it. A short drag is a Shift-click (adds one army).
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const boxEnded = useRef(false);
  const startBox = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!e.shiftKey || e.button !== 0 || props.touch || !props.onBoxSelect) return;
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const [x0, y0] = [e.clientX - r.left, e.clientY - r.top];
    let end: [number, number] | null = null;
    const move = (ev: MouseEvent) => {
      const [x1, y1] = [ev.clientX - r.left, ev.clientY - r.top];
      if (!end && Math.hypot(x1 - x0, y1 - y0) < 6) return;
      end = [x1, y1];
      setBox({ x0, y0, x1, y1 });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setBox(null);
      if (!end) return;
      // The click that ends the drag must not clear the selection.
      boxEnded.current = true;
      const [left, right] = [r.left + Math.min(x0, end[0]), r.left + Math.max(x0, end[0])];
      const [top, bottom] = [r.top + Math.min(y0, end[1]), r.top + Math.max(y0, end[1])];
      const ids = new Set<ArmyId>();
      for (const g of svg.querySelectorAll('g[data-army]')) {
        const id = g.getAttribute('data-army')!;
        if (ctrl.state.armies[id]?.owner !== ctrl.human) continue;
        const b = g.getBoundingClientRect();
        const [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2];
        if (cx >= left && cx <= right && cy >= top && cy <= bottom) ids.add(id);
      }
      if (ids.size) props.onBoxSelect!([...ids]);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
  };

  const zoomBy = (factor: number) => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(220).call(zoomRef.current.scaleBy, factor);
  };
  const zoomFit = () => {
    const svg = svgRef.current;
    if (!svg || !zoomRef.current) return;
    const { width, height } = svg.getBoundingClientRect();
    select(svg).transition().duration(400).call(zoomRef.current.transform, fitFor(width, height, insetRef.current, insetBottomRef.current).transform);
  };

  const ownersSig = world.provinceIds.map((id) => state.provinces[id].owner).join(',');
  // A province that changes hands flashes in its new owner's colour (not when a save loads).
  const lastOwners = useRef<string | null>(null);
  const [flashes, setFlashes] = useState<{ pid: ProvinceId; id: number; color: string }[]>([]);
  useEffect(() => {
    const before = lastOwners.current?.split(',');
    lastOwners.current = ownersSig;
    if (!before) return;
    const now = ownersSig.split(',');
    const changed = world.provinceIds.filter((_, i) => before[i] !== now[i]);
    if (!changed.length) return;
    const id = performance.now();
    setFlashes((f) => [...f.slice(-20), ...changed.map((pid) => ({ pid, id, color: ownerColor(world, state.provinces[pid].owner) }))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownersSig]);
  const warsSig = world.nationIds
    .flatMap((a) => world.nationIds.filter((b) => a < b && state.nations[a].relations[b]?.status === 'war').map((b) => `${a}>${b}`))
    .join(',');
  const suppliedSig = world.provinceIds.map((id) => (state.provinces[id].supplied ? '1' : '0')).join('');
  // The fog of war: '1' for each province in sight, '0' for one under the fog.
  const seen = ctrl.sight();
  const fogSig = world.provinceIds.map((id) => (seen.has(id) ? '1' : '0')).join('');
  const enemiesSig = world.nationIds.filter((id) => atWar(state, human, id)).join(',');
  // Morale is shown in steps of 2 so the layer re-renders only on visible changes; it is unknown under the fog.
  const valuesSig =
    props.mapMode === 'morale'
      ? world.provinceIds.map((id) => (seen.has(id) ? Math.round(state.provinces[id].morale / 2) * 2 : '')).join('|')
      : props.mapMode === 'development'
        ? world.provinceIds.map((id) => (world.provinces[id].city ? state.provinces[id].tier : '')).join('|')
        : '';
  const ownerOf = useMemo(() => {
    const o: Record<ProvinceId, string> = {};
    world.provinceIds.forEach((id, i) => (o[id] = ownersSig.split(',')[i]));
    return o;
  }, [world, ownersSig]);
  const fog = useMemo(() => {
    const hidden = new Set(world.provinceIds.filter((_, i) => fogSig[i] === '0'));
    return {
      shape: geo.union((pid) => hidden.has(pid)),
      edge: geo.arcs((a, b) => b !== null && hidden.has(a) !== hidden.has(b)),
    };
  }, [geo, world, fogSig]);

  const primaryArmy = props.selectedArmies.length > 0 ? state.armies[props.selectedArmies[0]] : undefined;
  const ownArmySelected = !!primaryArmy && primaryArmy.owner === human;

  // Movement connections of the selected army (or the selected province) are highlighted.
  const focusIds = primaryArmy ? (primaryArmy.move?.leg?.to ?? primaryArmy.province) : (props.selectedProvince ?? '');

  const k = transform.k;
  const ratio = k / (Math.max(fitK, MIN_ZOOM_BASE) * (props.compact ? COMPACT_DETAIL : 1));
  const view: [number, number, number, number] = [-transform.x / k, -transform.y / k, size[0] / k, size[1] / k];
  const showDetail = ratio >= ZOOM.detail;
  const modelPx = cityModelScale(ratio);

  // Route preview for the selected own army towards the hovered province or spot on a road (on touch, the picked target).
  const hoverTarget: MarchTarget | null = hoverRoad ?? (hovered ? { province: hovered } : null);
  const previewTo = props.touch ? (props.moveMode ? props.moveTarget : null) : hoverSelf ? null : hoverTarget;
  const previewKey = previewTo ? `${previewTo.province}>${previewTo.road?.toward ?? ''}@${previewTo.road?.at.toFixed(3) ?? ''}` : '';
  const preview = useMemo(() => {
    if (!ownArmySelected || !previewTo) return null;
    return routePreview(state, world, human, primaryArmy!, previewTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownArmySelected, previewKey, primaryArmy?.id, primaryArmy?.move?.leg?.to, ownersSig, ctrl.version]);

  /** A destination chosen in move mode: on touch, the first tap previews and the second orders. */
  const pickDestination = (target: MarchTarget) => {
    if (props.touch && !sameTarget(props.moveTarget, target)) props.onPickTarget(target);
    else props.onOrderMove(target);
  };
  const onProvinceClick = useStableCallback((pid: ProvinceId) => {
    if (props.moveMode && ownArmySelected) pickDestination({ province: pid });
    else props.onSelectProvince(pid);
  });
  const onProvinceContext = useStableCallback((pid: ProvinceId, e: React.MouseEvent) => {
    e.preventDefault();
    if (ownArmySelected) props.onOrderMove({ province: pid });
  });
  const onHover = useStableCallback((pid: ProvinceId | null, army?: ArmyId) => {
    setHovered(pid);
    setHoverSelf(!!army && props.selectedArmies.includes(army));
    props.onHover(pid, army);
  });
  // Clicking another army's counter in move mode, or right-clicking it, marches there.
  const ordersTo = (army: Army) => ownArmySelected && !props.selectedArmies.includes(army.id);
  const onArmyClick = useStableCallback((army: Army, additive: boolean) => {
    if (props.moveMode && ordersTo(army)) pickDestination(armyMarchTarget(army));
    else props.onSelectArmy(army.id, additive);
  });
  const onArmyContext = useStableCallback((army: Army) => {
    if (ordersTo(army)) props.onOrderMove(armyMarchTarget(army));
  });

  /**
   * The spot on a road under the pointer: on the road nearest it (roads into one land run close
   * together), where it would stop; or the province itself when the pointer is over a city the road
   * crosses, or over the end of the road.
   */
  const roadTargetAt = (e: React.MouseEvent<SVGLineElement>): MarchTarget | null => {
    // A road running across a city gives way to it: pointing at the city means the city.
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.hasAttribute('data-province'));
    const city = under?.getAttribute('data-province');
    if (city && isCity(world, city)) return { province: city };
    const m = e.currentTarget.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best: { a: ProvinceId; b: ProvinceId; f: number; d: number } | null = null;
    for (const c of world.scenario.connections) {
      if (!isOpenRoad(world, c.a, c.b)) continue;
      const [ax, ay] = geo.anchors[c.a];
      const [bx, by] = geo.anchors[c.b];
      const [dx, dy] = [bx - ax, by - ay];
      const f = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(ax + dx * f - p.x, ay + dy * f - p.y);
      if (!best || d < best.d) best = { a: c.a, b: c.b, f, d };
    }
    if (!best) return null;
    const { a, b, f } = best;
    const [dx, dy] = [geo.anchors[b][0] - geo.anchors[a][0], geo.anchors[b][1] - geo.anchors[a][1]];
    const len = Math.hypot(dx, dy) * k || 1;
    // How far the city reaches along the road (its built-up area is wider than it is deep), as a share of the road.
    const reach = (pid: ProvinceId) => {
      if (!cities) return 9 / len;
      const [hx, hy] = cities[pid].half;
      return Math.max(10, 1 / Math.hypot((dx * k) / len / Math.max(hx, 1), (dy * k) / len / Math.max(hy, 1))) / len;
    };
    if (f < reach(a)) return { province: a };
    if (f > 1 - reach(b)) return { province: b };
    return spotOnRoad(world, a, b, f);
  };
  const onRoad = useStableCallback((action: RoadAction, e: React.MouseEvent<SVGLineElement>) => {
    const target = action === 'leave' ? null : roadTargetAt(e);
    if (!target) {
      setHoverRoad(null);
      onHover(null);
      return;
    }
    if (action === 'point') {
      setHoverRoad(target);
      if (hovered !== target.province) onHover(target.province);
    } else if (action === 'order') props.onOrderMove(target);
    else if (props.moveMode && ownArmySelected) pickDestination(target);
    else props.onSelectProvince(target.province);
  });
  // The roads take the pointer only while one of your armies is selected; leaving that, forget the spot.
  const roadsLive = ownArmySelected && showDetail;
  useEffect(() => {
    if (!roadsLive) setHoverRoad(null);
  }, [roadsLive]);

  // Each city's model, rebuilt only when what it shows changes (sprites are cached by look).
  const cities = useMemo(() => {
    if (!modelPx) return null;
    const out: Record<ProvinceId, CityFootprint> = {};
    for (const [i, id] of world.provinceIds.entries()) {
      // Land has no model: its armies stand round its anchor, its name just below.
      if (!world.provinces[id].city) {
        out[id] = { sprite: null, port: null, mid: [0, 0], half: [0, 0], above: 0, below: 14 };
        continue;
      }
      const known = fogSig[i] === '1';
      const sprite = citySprite(cityModelProps(state, world, geo, id, known));
      const portProps = portModelProps(state, world, geo, id, known);
      const port = portProps && geo.ports[id] ? { image: portSprite(portProps), x: geo.ports[id]!.x, y: geo.ports[id]!.y } : null;
      // Armies stand round the built-up area; the name plate hangs just in front of it, or below
      // the port when that lies under the town (the port keeps its place on the coast as you zoom).
      const mid: Offset = [sprite.mid * modelPx, ((sprite.front - sprite.back) / 2) * modelPx];
      let below = (sprite.front + 1) * modelPx;
      if (port) {
        const [ax, ay] = geo.anchors[id];
        const im = port.image;
        const [left, top] = [(port.x - ax) * k - im.cx * modelPx, (port.y - ay) * k - im.cy * modelPx];
        const city = world.provinces[id].city!;
        const [w, h] = plateSize(city.name, city.size === 'capital' ? 10.5 : 9.5);
        const overlap = left < mid[0] + w / 2 && left + im.width * modelPx > mid[0] - w / 2 && top < below - 3 + h && top + im.height * modelPx > below - 3;
        if (overlap) below = top + im.height * modelPx + 3;
      }
      const half: Offset = [sprite.rx * modelPx, ((sprite.back + sprite.front) / 2) * modelPx];
      out[id] = { sprite, port, mid, half, above: sprite.structures.cy * modelPx, below };
    }
    return out;
    // ctrl.version changes whenever the simulation state does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, geo, modelPx, k, ctrl.version, fogSig]);

  const owners: string[] = [...world.nationIds, 'neutral'];
  return (
    <div className="map-stage">
      <svg
        ref={svgRef}
        className={`map mode-${props.mapMode}${props.moveMode ? ' move-mode' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={startBox}
        onClickCapture={(e) => {
          if (!boxEnded.current) return;
          boxEnded.current = false;
          e.stopPropagation();
        }}
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
          {/* The theatre's land: cities' streets stop at the coast. */}
          <clipPath id="land-clip">
            <path d={geo.land} />
          </clipPath>
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
        {/* Drawn at the live view: React may redraw in the middle of a pan (the game runs on). */}
        <g ref={viewRef} transform={live.current.toString()}>
          <SeaLayer geo={geo} glow={glow} />
          <WorldLayer geo={geo} />
          <TerrainLayer geo={geo} world={world} texture={texture} />
          {texture && <TerrainDetail geo={geo} world={world} view={view} k={k} />}
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
          <BorderLayer geo={geo} world={world} owners={ownersSig} ownerOf={ownerOf} human={human} enemies={enemiesSig} />
          <OtherFrontsLayer geo={geo} human={human} owners={ownersSig} wars={warsSig} ownerOf={ownerOf} />
          <FogLayer shape={fog.shape} edge={fog.edge} clouds={clouds} />
          <g className="overlay-layer" pointerEvents="none">
            {flashes.map((f) => (
              <path
                key={`${f.pid}-${f.id}`}
                d={geo.provincePaths[f.pid]}
                className="capture-flash"
                style={{ '--flash': f.color } as React.CSSProperties}
                onAnimationEnd={() => setFlashes((all) => all.filter((x) => x !== f))}
              />
            ))}
            {preview?.provinces.map((pid) => <path key={pid} d={geo.provincePaths[pid]} className="reach" />)}
            {hovered && !props.touch && <path d={geo.provincePaths[hovered]} className="hover-outline" />}
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
              <ConnectionLayer geo={geo} world={world} focusIds={focusIds} onRoad={roadsLive ? onRoad : null} />
              <LabelLayer geo={geo} world={world} owners={ownersSig} ownerOf={ownerOf} ratio={ratio} />
              {cities && <CityGroundLayer geo={geo} world={world} k={k} ratio={ratio} cities={cities} seen={seen} />}
              {/* A portal target: React's focus listeners make Chrome treat it as focusable, so keep it out of the tab order. */}
              <g ref={setArmyBack} className="army-layer army-models army-back" tabIndex={-1} />
              <CityLayer
                geo={geo}
                state={state}
                world={world}
                k={k}
                ratio={ratio}
                cities={cities}
                seen={seen}
                handlers={{ onClick: onProvinceClick, onContext: onProvinceContext, onHover }}
              />
              {cities ? (
                <ArmyModelLayer
                  ctrl={ctrl}
                  geo={geo}
                  k={k}
                  panning={panning}
                  px={unitModelScale(ratio)}
                  cities={cities}
                  back={armyBack}
                  selectedArmies={props.selectedArmies}
                  onArmyClick={onArmyClick}
                  onArmyContext={onArmyContext}
                  onHover={onHover}
                />
              ) : (
                <ArmyLayer
                  ctrl={ctrl}
                  geo={geo}
                  k={k}
                  panning={panning}
                  selectedArmies={props.selectedArmies}
                  onArmyClick={onArmyClick}
                  onArmyContext={onArmyContext}
                  onHover={onHover}
                />
              )}
              {cities && <CityNameLayer geo={geo} state={state} world={world} k={k} cities={cities} />}
              {preview &&
                (() => {
                  const { target } = preview;
                  const end = target.road ? roadPoint(geo, target.province, target.road) : geo.anchors[target.province];
                  const line = preview.path && marchLine(geo, primaryArmy!, preview.path, target.road && { province: target.province, ...target.road });
                  return (
                    <g className={`route-preview${props.moveMode ? ' strong' : ''}${preview.path ? '' : ' blocked'}`} pointerEvents="none">
                      {line && <polyline points={line.map((p) => p.join(',')).join(' ')} />}
                      <g transform={`translate(${end.join(',')}) scale(${1 / k})`}>
                        {target.road && <circle r={4.5} className="road-spot" />}
                        <Plate
                          text={preview.path ? `${targetName(world, target)} · ${formatDuration(preview.ticks, state)}` : preview.blocked}
                          y={target.road ? -14 : -34}
                          size={10.5}
                          className="eta"
                        />
                      </g>
                    </g>
                  );
                })()}
            </>
          )}
        </g>
      </svg>
      {box && (
        <div
          className="select-box"
          style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
        />
      )}
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
          {!props.compact && !props.touch && (
            <button
              className={`overview-toggle${overview ? ' active' : ''}`}
              onClick={() => {
                setOverview(!overview);
                rememberOverview(!overview);
              }}
              title={overview ? 'Hide the overview map' : 'Show the overview map'}
              aria-label="Overview map"
              aria-pressed={overview}
              data-testid="overview-toggle"
            >
              <Icon name="overview" />
            </button>
          )}
        </div>
        {/* Phones and touch screens pan with a finger: the overview would only take room. */}
        {overview && !props.compact && !props.touch && (
          <MiniMap
            geo={geo}
            world={world}
            owners={ownersSig}
            ownerOf={ownerOf}
            human={human}
            fog={fog.shape}
            view={view}
            onNavigate={(x, y, animate) => centreOn(x, y, null, animate ? 250 : 0)}
          />
        )}
      </div>
    </div>
  );
}

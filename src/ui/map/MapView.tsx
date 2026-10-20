// SVG strategy map: static geography is projected once and memoised; only
// ownership colours, labels (on zoom) and army markers (every frame) update.
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { NEUTRAL_COLOR } from '../../sim/scenario/europe/nations';
import { findPath, isArmyInTransit, type Army, type ArmyId, type GameState, type ProvinceId, type World } from '../../sim';
import type { GameController } from '../game/GameController';
import { MAP_HEIGHT, MAP_WIDTH, THEATRE_ISO, type MapGeometry } from './geo';

export interface MapViewProps {
  ctrl: GameController;
  geo: MapGeometry;
  selectedProvince: ProvinceId | null;
  selectedArmies: ArmyId[];
  moveMode: boolean;
  focus: { province: ProvinceId; seq: number } | null;
  onSelectProvince: (pid: ProvinceId | null) => void;
  onSelectArmy: (id: ArmyId, additive: boolean) => void;
  onOrderMove: (pid: ProvinceId) => void;
  onHover: (pid: ProvinceId | null) => void;
}

function ownerColor(world: World, owner: string): string {
  return owner === 'neutral' ? NEUTRAL_COLOR : (world.nations[owner]?.color ?? '#999');
}

// ---------------------------------------------------------------------------
// Static layers
// ---------------------------------------------------------------------------

const WorldLayer = memo(function WorldLayer({ geo }: { geo: MapGeometry }) {
  return (
    <g className="world-layer">
      {geo.countries.map((c) => (
        <path key={c.iso + c.name} d={c.d} className="country outside">
          <title>{THEATRE_ISO.has(c.iso) ? `${c.name} (territory outside the prototype theatre)` : `${c.name} — outside the prototype theatre`}</title>
        </path>
      ))}
    </g>
  );
});

interface ProvinceLayerProps {
  geo: MapGeometry;
  world: World;
  owners: string; // ownership signature, forces re-render when it changes
  ownerOf: Record<ProvinceId, string>;
  selected: ProvinceId | null;
  highlight: string; // joined ids of highlighted (reachable) provinces
  onClick: (pid: ProvinceId, e: React.MouseEvent) => void;
  onContext: (pid: ProvinceId, e: React.MouseEvent) => void;
  onHover: (pid: ProvinceId | null) => void;
}

const ProvinceLayer = memo(function ProvinceLayer(p: ProvinceLayerProps) {
  const highlight = new Set(p.highlight ? p.highlight.split(',') : []);
  return (
    <g className="province-layer">
      {p.world.provinceIds.map((id) => {
        const owner = p.ownerOf[id];
        return (
          <path
            key={id}
            d={p.geo.provincePaths[id]}
            fill={ownerColor(p.world, owner)}
            className={`province${owner === 'neutral' ? ' neutral' : ''}${p.selected === id ? ' selected' : ''}${highlight.has(id) ? ' reachable' : ''}`}
            data-province={id}
            onClick={(e) => p.onClick(id, e)}
            onContextMenu={(e) => p.onContext(id, e)}
            onMouseEnter={() => p.onHover(id)}
            onMouseLeave={() => p.onHover(null)}
          />
        );
      })}
      {/* Hatch overlay marks neutral minor states */}
      {p.world.provinceIds
        .filter((id) => p.ownerOf[id] === 'neutral')
        .map((id) => (
          <path key={`h-${id}`} d={p.geo.provincePaths[id]} className="neutral-hatch" pointerEvents="none" />
        ))}
    </g>
  );
});

const BorderLayer = memo(function BorderLayer({ geo, nationBorders }: { geo: MapGeometry; nationBorders: string }) {
  return (
    <g className="border-layer" pointerEvents="none">
      <path d={geo.provinceBorders} className="province-border" />
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
          <line key={`${c.a}|${c.b}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`connection ${c.kind}${active ? ' active' : ''}`}>
            {c.label && <title>{c.label}</title>}
          </line>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Dynamic layers
// ---------------------------------------------------------------------------

function CityLayer({ geo, state, world, k }: { geo: MapGeometry; state: GameState; world: World; k: number }) {
  const showProvinceNames = k >= 1.15;
  const showCityNames = k >= 2.2;
  const s = 1 / k;
  return (
    <g className="city-layer" pointerEvents="none">
      {world.provinceIds.map((id) => {
        const def = world.provinces[id];
        const [x, y] = geo.anchors[id];
        const [lx, ly] = geo.labelPoints[id];
        const capture = state.provinces[id].capture;
        const isCapital = def.city.size === 'capital' && def.core !== null;
        return (
          <g key={id}>
            {showProvinceNames && (
              <text x={lx} y={ly + 22 * s} fontSize={11 * s} className="province-label">
                {def.name}
              </text>
            )}
            <g transform={`translate(${x},${y}) scale(${s})`}>
              {def.objectiveVp ? (
                <g className="objective">
                  <circle r={9} className="objective-ring" />
                  <text y={3.5} className="objective-vp">
                    {def.objectiveVp}
                  </text>
                </g>
              ) : null}
              {isCapital ? (
                <path d="M0,-6 L1.8,-1.9 L6,-1.9 L2.6,0.8 L3.8,5 L0,2.5 L-3.8,5 L-2.6,0.8 L-6,-1.9 L-1.8,-1.9 Z" className="capital-star" />
              ) : (
                <circle r={def.city.size === 'major' || def.city.size === 'capital' ? 3.2 : 2.4} className="city-dot" />
              )}
              {capture && (
                <circle
                  r={12}
                  className="capture-ring"
                  stroke={world.nations[capture.by]?.color}
                  strokeDasharray={`${(capture.progress / capture.required) * 75.4} 75.4`}
                  transform="rotate(-90)"
                />
              )}
              {showCityNames && (
                <text y={-11} className="city-label">
                  {def.city.name}
                </text>
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}

function armyPosition(geo: MapGeometry, army: Army, alpha: number): [number, number] {
  const leg = army.move?.leg;
  if (!leg) return geo.anchors[army.province];
  const t = Math.min(1, (leg.elapsed + alpha) / leg.duration);
  const [x1, y1] = geo.anchors[leg.from];
  const [x2, y2] = geo.anchors[leg.to];
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

function ArmyMarker({
  army,
  world,
  x,
  y,
  k,
  selected,
  own,
  onSelect,
}: {
  army: Army;
  world: World;
  x: number;
  y: number;
  k: number;
  selected: boolean;
  own: boolean;
  onSelect: (id: ArmyId, additive: boolean) => void;
}) {
  const counts = { infantry: 0, artillery: 0, tank: 0 };
  let strength = 0;
  for (const u of army.units) {
    counts[u.type]++;
    strength += u.strength;
  }
  const main = counts.tank > 0 ? 'tank' : counts.artillery > counts.infantry ? 'artillery' : 'infantry';
  const color = ownerColor(world, army.owner);
  const avg = army.units.length ? strength / army.units.length : 0;
  return (
    <g
      transform={`translate(${x},${y}) scale(${1 / k})`}
      className={`army-marker${selected ? ' selected' : ''}${own ? ' own' : ''}${army.supplied ? '' : ' unsupplied'}`}
      data-army={army.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(army.id, e.shiftKey);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <title>
        {`${army.owner === 'neutral' ? 'Neutral garrison' : world.nations[army.owner].adjective + ' army'} — ${counts.infantry} INF, ${counts.artillery} ART, ${counts.tank} TNK (${Math.round(avg * 100)}% strength)${army.supplied ? '' : ' — OUT OF SUPPLY'}`}
      </title>
      <rect x={-19} y={-9} width={38} height={18} rx={3} fill={color} className="army-body" />
      <g transform="translate(-16,-6)">
        <rect x={0} y={0} width={15} height={11} fill="#fff" opacity={0.92} />
        {main === 'infantry' && <path d="M0 0 L15 11 M15 0 L0 11" stroke="#222" strokeWidth={1.2} />}
        {main === 'artillery' && <circle cx={7.5} cy={5.5} r={2.3} fill="#222" />}
        {main === 'tank' && <rect x={3} y={3} width={9} height={5} rx={2.5} fill="none" stroke="#222" strokeWidth={1.2} />}
      </g>
      <text x={9} y={4.5} className="army-count">
        {army.units.length}
      </text>
      <rect x={-19} y={10} width={38 * avg} height={2.5} className="army-strength" />
    </g>
  );
}

function ArmyLayer({
  ctrl,
  geo,
  k,
  selectedArmies,
  onSelectArmy,
}: {
  ctrl: GameController;
  geo: MapGeometry;
  k: number;
  selectedArmies: ArmyId[];
  onSelectArmy: (id: ArmyId, additive: boolean) => void;
}) {
  // Re-render every animation frame for smooth interpolation of marching armies.
  useSyncExternalStore(ctrl.subscribeFrame, () => ctrl.state.tick * 1000 + Math.floor(ctrl.loop.alpha * 1000));
  const { state, world } = ctrl;
  const alpha = ctrl.loop.paused ? 0 : ctrl.loop.alpha;
  const selected = new Set(selectedArmies);
  const stacks = new Map<ProvinceId, number>();
  const armies = Object.values(state.armies).sort((a, b) => (a.id < b.id ? -1 : 1));

  const routes: React.ReactNode[] = [];
  const markers: React.ReactNode[] = [];
  for (const army of armies) {
    let [x, y] = armyPosition(geo, army, alpha);
    if (!isArmyInTransit(army)) {
      const n = stacks.get(army.province) ?? 0;
      stacks.set(army.province, n + 1);
      y -= (17 + n * 20) / k;
    }
    const own = army.owner === ctrl.human;
    if (army.move && (own || selected.has(army.id))) {
      const pts: [number, number][] = [[x, y]];
      const remaining = army.move.leg ? army.move.path : army.move.path;
      for (const pid of remaining) pts.push(geo.anchors[pid]);
      if (pts.length > 1) {
        routes.push(
          <polyline
            key={`r-${army.id}`}
            points={pts.map((p) => p.join(',')).join(' ')}
            className={`route${selected.has(army.id) ? ' selected' : ''}`}
          />,
        );
      }
    }
    markers.push(
      <ArmyMarker
        key={army.id}
        army={army}
        world={world}
        x={x}
        y={y}
        k={k}
        selected={selected.has(army.id)}
        own={own}
        onSelect={onSelectArmy}
      />,
    );
  }

  const battles = Object.keys(state.battles).map((pid) => {
    const [x, y] = geo.anchors[pid];
    return (
      <g key={`b-${pid}`} transform={`translate(${x + 14 / k},${y + 8 / k}) scale(${1 / k})`} className="battle-icon" pointerEvents="none">
        <circle r={9} />
        <path d="M-5,-5 L5,5 M5,-5 L-5,5 M-6,-2 L-2,-6 M6,-2 L2,-6" />
      </g>
    );
  });

  return (
    <g className="army-layer">
      <g pointerEvents="none">{routes}</g>
      {battles}
      {markers}
    </g>
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

export function MapView(props: MapViewProps) {
  const { ctrl, geo } = props;
  const { world, state } = ctrl;
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hovered, setHovered] = useState<ProvinceId | null>(null);

  // Zoom & pan.
  useEffect(() => {
    const svg = svgRef.current!;
    const { width, height } = svg.getBoundingClientRect();
    const fit = Math.min(width / MAP_WIDTH, height / MAP_HEIGHT);
    const [[x0, y0], [x1, y1]] = geo.worldBounds;
    const minK = Math.max(0.05, Math.min(width / (x1 - x0), height / (y1 - y0)));
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minK, fit * 14])
      .translateExtent([
        [x0, y0],
        [x1, y1],
      ])
      .clickDistance(5)
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(e.transform));
    zoomRef.current = behavior;
    const sel = select(svg);
    sel.call(behavior).on('dblclick.zoom', null);
    const initial = zoomIdentity.translate((width - MAP_WIDTH * fit) / 2, (height - MAP_HEIGHT * fit) / 2).scale(fit);
    sel.call(behavior.transform, initial);
    return () => {
      sel.on('.zoom', null);
    };
  }, [geo]);

  // Centre on a province when requested (e.g. clicking an event).
  useEffect(() => {
    if (!props.focus || !svgRef.current || !zoomRef.current) return;
    const svg = svgRef.current;
    const { width, height } = svg.getBoundingClientRect();
    const [x, y] = geo.anchors[props.focus.province];
    const k = Math.max(transform.k, Math.min(width / MAP_WIDTH, height / MAP_HEIGHT) * 2.2);
    select(svg)
      .transition()
      .duration(450)
      .call(zoomRef.current.transform, zoomIdentity.translate(width / 2 - x * k, height / 2 - y * k).scale(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.seq]);

  const ownersSig = world.provinceIds.map((id) => state.provinces[id].owner).join(',');
  const ownerOf = useMemo(() => {
    const o: Record<ProvinceId, string> = {};
    world.provinceIds.forEach((id, i) => (o[id] = ownersSig.split(',')[i]));
    return o;
  }, [world, ownersSig]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nationBorders = useMemo(() => geo.nationBorders((pid) => ownerOf[pid]), [geo, ownersSig]);

  const primaryArmy = props.selectedArmies.length > 0 ? state.armies[props.selectedArmies[0]] : undefined;
  const ownArmySelected = primaryArmy && primaryArmy.owner === ctrl.human;

  // Reachable neighbours of the selected army (or the selected province's connections).
  const focusIds = primaryArmy ? (primaryArmy.move?.leg?.to ?? primaryArmy.province) : (props.selectedProvince ?? '');
  const highlight = useMemo(() => {
    if (!ownArmySelected || !props.moveMode || !hovered) return '';
    const from = primaryArmy!.move?.leg ? primaryArmy!.move.leg.to : primaryArmy!.province;
    const route = findPath(state, world, primaryArmy!, from, hovered);
    return route ? [from, ...route.path].join(',') : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownArmySelected, props.moveMode, hovered, primaryArmy?.id, ownersSig, ctrl.version]);

  const onProvinceClick = useStableCallback((pid: ProvinceId) => {
    if (props.moveMode && ownArmySelected) props.onOrderMove(pid);
    else props.onSelectProvince(pid);
  });
  const onProvinceContext = useStableCallback((pid: ProvinceId, e: React.MouseEvent) => {
    e.preventDefault();
    if (ownArmySelected) props.onOrderMove(pid);
  });
  const onHover = useStableCallback((pid: ProvinceId | null) => {
    setHovered(pid);
    props.onHover(pid);
  });

  const k = transform.k;
  const detailK = 0.35;
  return (
    <svg
      ref={svgRef}
      className={`map${props.moveMode ? ' move-mode' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.target === svgRef.current) props.onSelectProvince(null);
      }}
      data-zoom={k.toFixed(3)}
    >
      <defs>
        <pattern id="hatch-outside" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="hatch-bg" />
          <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
        </pattern>
        <pattern id="hatch-neutral" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="5" className="hatch-neutral-line" />
        </pattern>
      </defs>
      <g transform={transform.toString()}>
        <WorldLayer geo={geo} />
        <ProvinceLayer
          geo={geo}
          world={world}
          owners={ownersSig}
          ownerOf={ownerOf}
          selected={props.selectedProvince}
          highlight={highlight}
          onClick={onProvinceClick}
          onContext={onProvinceContext}
          onHover={onHover}
        />
        <BorderLayer geo={geo} nationBorders={nationBorders} />
        {/* Zoomed far out the theatre is tiny: hide markers so the world context stays readable. */}
        {k >= detailK && (
          <>
            <ConnectionLayer geo={geo} world={world} focusIds={focusIds} />
            <CityLayer geo={geo} state={state} world={world} k={k} />
            <ArmyLayer ctrl={ctrl} geo={geo} k={k} selectedArmies={props.selectedArmies} onSelectArmy={props.onSelectArmy} />
          </>
        )}
      </g>
    </svg>
  );
}

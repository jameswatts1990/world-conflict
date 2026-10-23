// Where the 3D armies stand on the map: spots around a city for the armies in it,
// and the stretch of road between two cities' edges for those on the march. Pure
// geometry in screen pixels from the middle of a city's built-up area (y down),
// so it can be tested.

export type Offset = [number, number];

/** A city's name plate, relative to the middle of its built-up area: half its width, and its top and bottom edges. */
export interface PlateBox {
  half: number;
  top: number;
  bottom: number;
}

/**
 * How far an army reaches from its ground point, in rooms: across, and above it (its figures and the
 * flag badge over them; the badge alone is about BADGE_PX tall), and below it (its ring).
 */
const REACH_X = 1;
const REACH_UP = 1.5;
const BADGE_PX = 24;
const REACH_DOWN = 0.5;

/**
 * Directions (degrees on screen, y down) tried for each spot, in order: beside the
 * city, its front corners, its back corners, then behind it. Straight below is left
 * to the city's name plate.
 */
const ANGLES = [180, 0, 150, 30, 210, 330, 240, 300, 270];
/** Outer rings also try the directions in between, and the lower corners. */
const OUTER = [...ANGLES, 125, 55, 165, 15, 195, 345, 225, 315, 255, 285];
/** Rings tried before spots are simply stacked on the last one. */
const RINGS = 6;
/**
 * The first ring stands on the edge of the built-up area (the outer building plots, where an
 * army in a city would camp), not clear of it: this share of the area in, plus this much room out.
 */
const EDGE_IN = 0.8;
const EDGE_OUT = [0.45, 0.3];

/** Two armies whose ground points are closer than this (in rooms, across and up the screen) overlap. */
const CLEAR_X = 2.1;
const CLEAR_Y = 1.5;
/** The first ring's least reach, in rooms: the two armies beside it then stand clear of each other. */
const MIN_OUT = [CLEAR_X / 2 + 0.05, 0.75];

const spotCache = new Map<string, Offset[]>();

/**
 * The first `n` spots around a city whose built-up area reaches `half` pixels
 * (across, and up and down the screen) from its middle, for armies taking `room`
 * pixels each. Spots fill rings round the city, the first on the edge of its
 * built-up area, each clear of its name plate (figures and badge alike) and of the
 * spots before it; adding an army never moves the others (spot i depends only on i).
 */
export function citySpots(half: Offset, room: number, n: number, plate?: PlateBox): Offset[] {
  const [hx, hy] = half.map((h) => Math.round(h * 2) / 2);
  const box = plate && { half: Math.round(plate.half), top: Math.round(plate.top), bottom: Math.round(plate.bottom) };
  const key = `${hx}|${hy}|${Math.round(room * 4)}|${box ? `${box.half},${box.top},${box.bottom}` : ''}`;
  let spots = spotCache.get(key);
  if (!spots || spots.length < n) {
    spots = layoutSpots(hx, hy, Math.round(room * 4) / 4, Math.max(n, 12), box);
    spotCache.set(key, spots);
    if (spotCache.size > 400) spotCache.delete(spotCache.keys().next().value!);
  }
  return spots.slice(0, n);
}

/** Whether an army standing at (x, y) would cover any of the plate. */
export function coversPlate([x, y]: Offset, room: number, plate: PlateBox): boolean {
  const reachX = Math.max(REACH_X * room, BADGE_PX * 0.7);
  return Math.abs(x) < plate.half + reachX && y - REACH_UP * room - BADGE_PX < plate.bottom && y + REACH_DOWN * room > plate.top;
}

function layoutSpots(hx: number, hy: number, room: number, n: number, plate?: PlateBox): Offset[] {
  const spots: Offset[] = [];
  const clear = (spot: Offset) =>
    !(plate && coversPlate(spot, room, plate)) &&
    spots.every(([sx, sy]) => Math.hypot((spot[0] - sx) / (CLEAR_X * room), (spot[1] - sy) / (CLEAR_Y * room)) >= 1);
  let ring = 0;
  for (; ring < RINGS && spots.length < n; ring++) {
    // Never so close in that two armies cannot stand side by side (a land's anchor has no built-up area).
    const rx = Math.max(hx * EDGE_IN + room * EDGE_OUT[0], room * MIN_OUT[0]) + room * 2 * ring;
    const ry = Math.max(hy * EDGE_IN + room * EDGE_OUT[1], room * MIN_OUT[1]) + room * 1.4 * ring;
    for (const deg of ring === 0 ? ANGLES : OUTER) {
      const a = (deg * Math.PI) / 180;
      const spot: Offset = [Math.cos(a) * rx, Math.sin(a) * ry];
      if (clear(spot)) spots.push(spot);
      if (spots.length >= n) break;
    }
  }
  // A crowd beyond every ring: queue up in rows to the left.
  for (let i = 0; spots.length < n; i++) {
    const rx = Math.max(hx * EDGE_IN + room * EDGE_OUT[0], room * MIN_OUT[0]) + room * 2 * ring;
    spots.push([-rx - (i % 4) * CLEAR_X * room, (Math.floor(i / 4) - 1) * CLEAR_Y * room]);
  }
  return spots;
}

/** Where a road towards (dx, dy) leaves the edge of a city whose built-up area reaches `half` from its middle. */
function edge(dx: number, dy: number, [hx, hy]: Offset, room: number): Offset {
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const t = 1 / Math.hypot(ux / (hx + room * 0.9), uy / (hy + room * 0.6));
  return [ux * t, uy * t];
}

/**
 * Where a march between two cities `length` pixels apart in direction (dx, dy)
 * starts and ends, as offsets from the middle of each city's built-up area: at its
 * edges, so armies do not walk across the cities. On a short road the ends are
 * pulled in, so an army never walks backwards.
 */
export function roadEnds(dx: number, dy: number, halfFrom: Offset, halfTo: Offset, room: number, length: number): [Offset, Offset] {
  const start = edge(dx, dy, halfFrom, room);
  const end = edge(-dx, -dy, halfTo, room);
  const used = Math.hypot(...start) + Math.hypot(...end);
  const f = used > length * 0.8 ? (length * 0.8) / used : 1;
  return [
    [start[0] * f, start[1] * f],
    [end[0] * f, end[1] * f],
  ];
}

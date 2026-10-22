// Map geometry for rendering only. Shapes come from bundled Natural Earth
// TopoJSON; gameplay adjacency lives in the simulation's scenario data. The
// provinces and the world around them share one topology, so their coasts and
// borders are the same lines.
import { geoArea, geoGraticule, geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import mapJson from '../../assets/map/map.topo.json';
import type { OwnerId, ProvinceId, World } from '../../sim';

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 820;

const topo = mapJson as unknown as Topology<{
  provinces: GeometryCollection<{ pid: string; iso: string }>;
  countries: GeometryCollection<{ iso: string; name: string }>;
}>;

/** Countries that are (partly) represented by playable provinces. */
export const THEATRE_ISO = new Set(topo.objects.provinces.geometries.map((g) => (g.properties as { iso: string }).iso));

export interface CountryShape {
  iso: string;
  name: string;
  d: string;
  bounds: [[number, number], [number, number]];
}

export interface MapGeometry {
  provincePaths: Record<ProvinceId, string>;
  labelPoints: Record<ProvinceId, [number, number]>;
  anchors: Record<ProvinceId, [number, number]>;
  /** Projected secondary towns per province (drawn at close zoom). */
  towns: Record<ProvinceId, { name: string; x: number; y: number }[]>;
  countries: CountryShape[];
  /** Projected area of each province, in map units² (for label weighting). */
  provinceArea: Record<ProvinceId, number>;
  provinceBounds: Record<ProvinceId, [[number, number], [number, number]]>;
  /** Bounding box of the playable theatre, in map units. */
  theatreBounds: [[number, number], [number, number]];
  coastline: string;
  graticule: string;
  provinceBorders: string;
  worldBounds: [[number, number], [number, number]];
  nationBorders: (ownerOf: (pid: ProvinceId) => OwnerId) => string;
  /** Full outline (land borders and coast) of everything one owner holds. */
  ownerOutline: (owner: OwnerId, ownerOf: (pid: ProvinceId) => OwnerId) => string;
}

function largestPolygon(f: Feature<Polygon | MultiPolygon>): Feature<Polygon> {
  if (f.geometry.type === 'Polygon') return f as Feature<Polygon>;
  let best: Feature<Polygon> | null = null;
  let bestArea = -1;
  for (const coords of f.geometry.coordinates) {
    const poly: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } };
    const a = geoArea(poly);
    if (a > bestArea) {
      bestArea = a;
      best = poly;
    }
  }
  return best!;
}

function pidOf(g: { properties?: unknown }): string {
  return (g.properties as { pid: string }).pid;
}

const cache = new WeakMap<World, MapGeometry>();

/** Projected geometry for a world, built once and shared by the menu and the game. */
export function mapGeometry(world: World): MapGeometry {
  let geo = cache.get(world);
  if (!geo) {
    geo = buildMapGeometry(world);
    cache.set(world, geo);
  }
  return geo;
}

export function buildMapGeometry(world: World): MapGeometry {
  const provinces = feature(topo, topo.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, { pid: string; iso: string }>;
  const countries = feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { iso: string; name: string }>;

  const projection = geoMercator().fitExtent(
    [
      [30, 30],
      [MAP_WIDTH - 30, MAP_HEIGHT - 30],
    ],
    provinces,
  );
  const path = geoPath(projection);

  const provincePaths: Record<ProvinceId, string> = {};
  const labelPoints: Record<ProvinceId, [number, number]> = {};
  const provinceArea: Record<ProvinceId, number> = {};
  const provinceBounds: Record<ProvinceId, [[number, number], [number, number]]> = {};
  provinces.features.forEach((f) => {
    provincePaths[f.properties.pid] = path(f) ?? '';
    labelPoints[f.properties.pid] = path.centroid(largestPolygon(f));
    provinceArea[f.properties.pid] = path.area(f);
    provinceBounds[f.properties.pid] = path.bounds(largestPolygon(f)) as [[number, number], [number, number]];
  });

  const anchors: Record<ProvinceId, [number, number]> = {};
  const towns: MapGeometry['towns'] = {};
  for (const id of world.provinceIds) {
    anchors[id] = projection(world.provinces[id].city.coord) as [number, number];
    towns[id] = world.provinces[id].towns.map((t) => {
      const [x, y] = projection(t.coord) as [number, number];
      return { name: t.name, x, y };
    });
  }

  const countryShapes: CountryShape[] = countries.features.map((f) => ({
    iso: f.properties.iso,
    name: f.properties.name,
    d: path(f) ?? '',
    bounds: path.bounds(f) as [[number, number], [number, number]],
  }));

  const geoms = topo.objects.provinces;
  const coastline = path(mesh(topo, geoms, (a, b) => a === b)) ?? '';
  const provinceBorders = path(mesh(topo, geoms, (a, b) => a !== b)) ?? '';
  const graticule =
    path(
      geoGraticule()
        .extent([
          [-180, -60],
          [180, 84],
        ])
        .step([5, 5])(),
    ) ?? '';
  const theatreBounds = path.bounds(provinces) as [[number, number], [number, number]];

  const worldBounds = path.bounds({ type: 'Sphere' }) as [[number, number], [number, number]];
  // Mercator is unbounded at the poles; clamp to the inhabited latitudes we draw.
  const north = projection([0, 84])![1];
  const south = projection([0, -60])![1];
  worldBounds[0][1] = north;
  worldBounds[1][1] = south;

  return {
    provincePaths,
    labelPoints,
    anchors,
    towns,
    countries: countryShapes,
    provinceArea,
    provinceBounds,
    theatreBounds,
    coastline,
    graticule,
    provinceBorders,
    worldBounds,
    nationBorders: (ownerOf) =>
      path(
        mesh(topo, geoms, (a, b) => a !== b && ownerOf(pidOf(a)) !== ownerOf(pidOf(b))),
      ) ?? '',
    ownerOutline: (owner, ownerOf) =>
      path(
        mesh(topo, geoms, (a, b) => {
          const inA = ownerOf(pidOf(a)) === owner;
          return a === b ? inA : inA !== (ownerOf(pidOf(b)) === owner);
        }),
      ) ?? '',
  };
}

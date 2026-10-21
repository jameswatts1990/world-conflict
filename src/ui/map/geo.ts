// Map geometry for rendering only. Shapes come from bundled Natural Earth
// TopoJSON; gameplay adjacency lives in the simulation's scenario data.
import { geoArea, geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import theatreJson from '../../assets/map/theatre.topo.json';
import worldJson from '../../assets/map/world.topo.json';
import type { OwnerId, ProvinceId, World } from '../../sim';

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 820;

const theatreTopo = theatreJson as unknown as Topology<{ provinces: GeometryCollection<{ pid: string }> }>;
const worldTopo = worldJson as unknown as Topology<{ countries: GeometryCollection<{ iso: string; name: string }> }>;

/** Countries that are (partly) represented by playable provinces. */
export const THEATRE_ISO = new Set(['GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'BEL', 'LUX', 'NLD', 'CHE', 'AUT', 'CZE', 'DNK', 'PRT']);

export interface CountryShape {
  iso: string;
  name: string;
  d: string;
}

export interface MapGeometry {
  provincePaths: Record<ProvinceId, string>;
  labelPoints: Record<ProvinceId, [number, number]>;
  anchors: Record<ProvinceId, [number, number]>;
  /** Projected secondary towns per province (drawn at close zoom). */
  towns: Record<ProvinceId, { name: string; x: number; y: number }[]>;
  countries: CountryShape[];
  coastline: string;
  provinceBorders: string;
  worldBounds: [[number, number], [number, number]];
  nationBorders: (ownerOf: (pid: ProvinceId) => OwnerId) => string;
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

export function buildMapGeometry(world: World): MapGeometry {
  const provinces = feature(theatreTopo, theatreTopo.objects.provinces) as FeatureCollection<Polygon | MultiPolygon, { pid: string }>;
  const countries = feature(worldTopo, worldTopo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { iso: string; name: string }>;

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
  const geomById = new Map<string, number>();
  provinces.features.forEach((f, i) => {
    provincePaths[f.properties.pid] = path(f) ?? '';
    labelPoints[f.properties.pid] = path.centroid(largestPolygon(f));
    geomById.set(f.properties.pid, i);
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
  }));

  const geoms = theatreTopo.objects.provinces;
  const coastline = path(mesh(theatreTopo, geoms, (a, b) => a === b)) ?? '';
  const provinceBorders = path(mesh(theatreTopo, geoms, (a, b) => a !== b)) ?? '';

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
    coastline,
    provinceBorders,
    worldBounds,
    nationBorders: (ownerOf) =>
      path(
        mesh(theatreTopo, geoms, (a, b) => a !== b && ownerOf(pidOf(a)) !== ownerOf(pidOf(b))),
      ) ?? '',
  };
}

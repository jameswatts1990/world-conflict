// Shaded-relief terrain texture for the playable provinces, baked once per
// session. An SVG with turbulence and lighting filters is rasterised by the
// browser into a bitmap; the map draws that bitmap under the ownership tint, so
// panning and zooming never re-run the filters.
import type { ProvinceId, Terrain, World } from '../../sim';
import type { MapGeometry } from './geo';

export interface TerrainTexture {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Muted base colours: the nation tint on top supplies most of the hue. */
export const TERRAIN_BASE: Record<Terrain, string> = {
  plains: '#cfcb9c',
  forest: '#9aa874',
  hills: '#c4b48a',
  mountains: '#b7ab95',
  urban: '#c9c1b0',
  marsh: '#a9b593',
};

/** Relief amplitude per terrain, 0..1. Blurred across borders so ranges blend. */
const RELIEF: Record<Terrain, number> = {
  plains: 0.1,
  forest: 0.24,
  hills: 0.45,
  mountains: 0.9,
  urban: 0.08,
  marsh: 0.04,
};

/** Detail channels: red = forest canopy, green = marsh reeds, blue = urban speckle. */
const DETAIL: Record<Terrain, string> = {
  plains: '#000',
  forest: '#f00',
  hills: '#000',
  mountains: '#000',
  urban: '#00f',
  marsh: '#0f0',
};

/** Texture resolution in pixels per map unit. */
const PX_PER_UNIT = 3;

/** Sea-glow resolution: the glow is blurred, so one pixel per map unit is plenty. */
const GLOW_PX_PER_UNIT = 1;
/** How far beyond the theatre the coastal glow extends, in map units. */
const GLOW_REACH = 420;

let cached: Promise<TerrainTexture | null> | null = null;
let cachedGlow: Promise<TerrainTexture | null> | null = null;

/** The baked texture, shared by every map instance in this session. */
export function terrainTexture(geo: MapGeometry, world: World): Promise<TerrainTexture | null> {
  if (!cached) {
    cached = bake(geo, world).catch((e: unknown) => {
      console.warn('Terrain texture unavailable; using flat colours.', e);
      return null;
    });
  }
  return cached;
}

/**
 * Soft shallow-water glow along every coast near the theatre, fading out with
 * distance. Baked because stroking wide glows on the world coastline every
 * frame made panning slow.
 */
export function seaGlowTexture(geo: MapGeometry): Promise<TerrainTexture | null> {
  if (!cachedGlow) {
    cachedGlow = bakeSeaGlow(geo).catch((e: unknown) => {
      console.warn('Coastal glow unavailable.', e);
      return null;
    });
  }
  return cachedGlow;
}

function bakeSeaGlow(geo: MapGeometry): Promise<TerrainTexture> {
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const x = Math.floor(bx0 - GLOW_REACH);
  const y = Math.floor(by0 - GLOW_REACH);
  const w = Math.ceil(bx1 + GLOW_REACH) - x;
  const h = Math.ceil(by1 + GLOW_REACH) - y;
  const near = geo.countries.filter((c) => c.bounds[1][0] > x && c.bounds[0][0] < x + w && c.bounds[1][1] > y && c.bounds[0][1] < y + h);
  const land = near.map((c) => `<path d="${c.d}"/>`).join('') + Object.values(geo.provincePaths).map((d) => `<path d="${d}"/>`).join('');
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * GLOW_PX_PER_UNIT)}" height="${Math.round(h * GLOW_PX_PER_UNIT)}" viewBox="${x} ${y} ${w} ${h}">
<defs>
<radialGradient id="fade" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${Math.max(w, h) / 2}">
  <stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
</radialGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#fade)"/></mask>
<filter id="wide" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="near" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="2.2"/></filter>
</defs>
<g mask="url(#m)">
  <g filter="url(#wide)" fill="#6fb9dd" fill-opacity="0.5">${land}</g>
  <g filter="url(#near)" fill="#a6dcf2" fill-opacity="0.55">${land}</g>
</g>
</svg>`;
  return rasterise(svg, w * GLOW_PX_PER_UNIT, h * GLOW_PX_PER_UNIT).then((href) => ({ href, x, y, width: w, height: h }));
}

/** Renders an SVG document to a bitmap once and returns an object URL for it. */
async function rasterise(svg: string, width: number, height: number): Promise<string> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('Could not encode the texture');
    return URL.createObjectURL(blob);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function terrainSvg(geo: MapGeometry, world: World, x: number, y: number, w: number, h: number): string {
  const ids: ProvinceId[] = world.provinceIds;
  const defs = ids.map((id, i) => `<path id="p${i}" d="${geo.provincePaths[id]}"/>`).join('');
  const uses = (attr: (id: ProvinceId) => string) => ids.map((id, i) => `<use href="#p${i}" ${attr(id)}/>`).join('');
  const terrain = (id: ProvinceId) => world.provinces[id].terrain;
  const region = `filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * PX_PER_UNIT)}" height="${Math.round(h * PX_PER_UNIT)}" viewBox="${x} ${y} ${w} ${h}">
<defs>${defs}
<clipPath id="land">${uses(() => '')}</clipPath>
<filter id="relief" ${region}>
  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="amp"/>
  <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="6" seed="11" result="noise"/>
  <feComponentTransfer in="noise" result="ridges"><feFuncA type="table" tableValues="1 0.35 0"/></feComponentTransfer>
  <feComposite in="ridges" in2="amp" operator="in" result="height"/>
  <feDiffuseLighting in="height" surfaceScale="12" diffuseConstant="1" lighting-color="#fff" result="light">
    <feDistantLight azimuth="225" elevation="40"/>
  </feDiffuseLighting>
  <feColorMatrix in="light" type="matrix" values="0 0 0 0 0.06  0 0 0 0 0.08  0 0 0 0 0.12  -1.9 0 0 0 1.222" result="shade"/>
  <feColorMatrix in="light" type="matrix" values="0 0 0 0 1  0 0 0 0 0.99  0 0 0 0 0.95  1.3 0 0 0 -0.836" result="lit"/>
  <feMerge><feMergeNode in="shade"/><feMergeNode in="lit"/></feMerge>
</filter>
<filter id="detail" ${region}>
  <feTurbulence type="fractalNoise" baseFrequency="0.24" numOctaves="3" seed="5" result="fine"/>
  <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.3  0 0 0 0 0.14  2.6 0 0 0 -1.2" result="canopy"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="forestW"/>
  <feComposite in="canopy" in2="forestW" operator="in" result="forest"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.05 0.22" numOctaves="2" seed="9" result="streak"/>
  <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.44  0 0 0 0 0.46  2.4 0 0 0 -1.15" result="reeds"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 1 0 0 0" result="marshW"/>
  <feComposite in="reeds" in2="marshW" operator="in" result="marsh"/>
  <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.4  0 0 0 0 0.37  0 0 9 0 -4.9" result="speck"/>
  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="urbanW"/>
  <feComposite in="speck" in2="urbanW" operator="in" result="urban"/>
  <feMerge><feMergeNode in="forest"/><feMergeNode in="marsh"/><feMergeNode in="urban"/></feMerge>
</filter>
</defs>
<g>${uses((id) => `fill="${TERRAIN_BASE[terrain(id)]}"`)}</g>
<g clip-path="url(#land)"><g filter="url(#detail)">${uses((id) => `fill="${DETAIL[terrain(id)]}"`)}</g></g>
<g clip-path="url(#land)"><g filter="url(#relief)">${uses((id) => `fill="#fff" fill-opacity="${RELIEF[terrain(id)]}"`)}</g></g>
</svg>`;
}

async function bake(geo: MapGeometry, world: World): Promise<TerrainTexture> {
  const [[bx0, by0], [bx1, by1]] = geo.theatreBounds;
  const pad = 4;
  const x = Math.floor(bx0 - pad);
  const y = Math.floor(by0 - pad);
  const w = Math.ceil(bx1 + pad) - x;
  const h = Math.ceil(by1 + pad) - y;
  const href = await rasterise(terrainSvg(geo, world, x, y, w, h), w * PX_PER_UNIT, h * PX_PER_UNIT);
  return { href, x, y, width: w, height: h };
}

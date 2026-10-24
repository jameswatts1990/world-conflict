// Baked from the supplied WWI model by scripts/art/render-infantry.py.
// Share each PNG across nations; the map keeps its national flags and rings.
import portrait from '../../assets/units/wwi-infantry/portrait.png';
import { UNIT_HEADINGS } from './UnitModel';

export const INFANTRY_PORTRAIT = portrait;

const images = import.meta.glob<string>('../../assets/units/wwi-infantry/heading-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const sprites = Array.from({ length: UNIT_HEADINGS }, (_, heading) => ({
  href: images[`../../assets/units/wwi-infantry/heading-${String(heading).padStart(2, '0')}.png`],
  // Fixed projected canvas and ground origin from render-infantry.py.
  width: 5,
  height: 3.5,
  cx: 2.5,
  cy: 2.6,
}));

export function infantrySprite(heading: number) {
  return sprites[((Math.round(heading) % UNIT_HEADINGS) + UNIT_HEADINGS) % UNIT_HEADINGS];
}

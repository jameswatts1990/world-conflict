/// <reference types="vite/client" />
// Imported model artwork. Defaults are deliberately shared across nations and
// eras for now; add generation overrides here when replacement models arrive.
import frames from '../../assets/units/frames.json';
import { UNIT_HEADINGS } from './UnitModel';
import type { ArtGen, ArtUnitType } from './types';

type AssetId = keyof typeof frames;
interface AssetChoice {
  default: AssetId;
  generations?: Partial<Record<ArtGen, AssetId>>;
}

export const UNIT_ASSETS: Partial<Record<ArtUnitType, AssetChoice>> = {
  infantry: { default: 'wwi-infantry' },
  stormtroopers: { default: 'assault-infantry' },
  mountain: { default: 'mountain-troops' },
  cavalry: { default: 'cavalry' },
  motorised: { default: 'motorised-infantry' },
  armouredCar: { default: 'armoured-cars' },
  artillery: { default: 'field-artillery' },
  heavyArtillery: { default: 'heavy-siege-artillery' },
  antiTank: { default: 'anti-tank-guns' },
  lightTank: { default: 'light-tanks' },
  tank: { default: 'battle-tanks' },
  heavyTank: { default: 'heavy-tanks' },
  tankDestroyer: { default: 'tank-destroyers' },
};

const images = import.meta.glob<string>('../../assets/units/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Also used by the standalone artwork sheets to embed their local PNGs. */
export const UNIT_ASSET_FILES = new Map(Object.entries(images).map(([path, url]) => [url, path.replace('../../assets/units/', '')]));

export function unitAssetId(type: ArtUnitType | 'transport', gen: ArtGen): AssetId | undefined {
  if (type === 'transport') return undefined;
  const choice = UNIT_ASSETS[type];
  return choice?.generations?.[gen] ?? choice?.default;
}

function assetImage(asset: AssetId, name: string): string {
  const href = images[`../../assets/units/${asset}/${name}.png`];
  if (!href) throw new Error(`Missing baked unit image: ${asset}/${name}.png`);
  return href;
}

export function unitAssetPortrait(type: ArtUnitType, gen: ArtGen): string | undefined {
  const asset = unitAssetId(type, gen);
  return asset && assetImage(asset, 'portrait');
}

const sprites = new Map<string, { href: string; width: number; height: number; cx: number; cy: number }>();

export function bakedUnitSprite(type: ArtUnitType | 'transport', gen: ArtGen, heading: number) {
  const asset = unitAssetId(type, gen);
  if (!asset) return undefined;
  const direction = ((Math.round(heading) % UNIT_HEADINGS) + UNIT_HEADINGS) % UNIT_HEADINGS;
  const key = `${asset}/${direction}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    sprite = { ...frames[asset], href: assetImage(asset, `heading-${String(direction).padStart(2, '0')}`) };
    sprites.set(key, sprite);
  }
  return sprite;
}

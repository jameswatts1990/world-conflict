import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_GENS, ART_UNIT_TYPES } from '../src/ui/art/types';
import { UNIT_HEADINGS } from '../src/ui/art/UnitModel';
import { UNIT_ASSETS, UNIT_ASSET_FILES, bakedUnitSprite, unitAssetPortrait } from '../src/ui/art/UnitAssets';

function png(href: string) {
  const file = UNIT_ASSET_FILES.get(href);
  expect(file, href).toBeDefined();
  const bytes = readFileSync(new URL(`../src/assets/units/${file}`, import.meta.url));
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes[25]).toBe(6); // RGBA: transparent backgrounds, not opaque export previews.
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('imported unit artwork', () => {
  it('ships a portrait and sixteen PNGs with a stable ground anchor for every unit', () => {
    for (const type of ART_UNIT_TYPES) {
      for (const gen of ART_GENS) {
        png(unitAssetPortrait(type, gen)!);
        const sprites = Array.from({ length: UNIT_HEADINGS }, (_, h) => bakedUnitSprite(type, gen, h)!);
        expect(new Set(sprites.map(s => s.href)).size, `${type} ${gen}`).toBe(UNIT_HEADINGS);
        for (const sprite of sprites) {
          const size = png(sprite.href);
          expect(size.width / size.height).toBeCloseTo(sprite.width / sprite.height, 2);
          expect(sprite.cx).toBeGreaterThan(0);
          expect(sprite.cx).toBeLessThan(sprite.width);
          expect(sprite.cy).toBeGreaterThan(0);
          expect(sprite.cy).toBeLessThan(sprite.height);
          expect([sprite.width, sprite.height, sprite.cx, sprite.cy]).toEqual(
            [sprites[0].width, sprites[0].height, sprites[0].cx, sprites[0].cy],
          );
        }
        expect(bakedUnitSprite(type, gen, -1)).toBe(sprites[15]);
        expect(bakedUnitSprite(type, gen, 16)).toBe(sprites[0]);
      }
    }
  });

  it('shares the current defaults across eras and leaves transports to the procedural renderer', () => {
    for (const type of ART_UNIT_TYPES) {
      for (const gen of ART_GENS) {
        expect(bakedUnitSprite(type, gen, 4)).toBe(bakedUnitSprite(type, 'ww1', 4));
        expect(unitAssetPortrait(type, gen)).toBe(unitAssetPortrait(type, 'ww1'));
      }
    }
    expect(bakedUnitSprite('transport', 'ww1', 0)).toBeUndefined();
  });

  it('can override one era while retaining the default model in the others', () => {
    const original = UNIT_ASSETS.tank;
    const normal = bakedUnitSprite('tank', 'ww1', 0);
    try {
      UNIT_ASSETS.tank = { default: 'battle-tanks', generations: { ww2: 'heavy-tanks' } };
      expect(bakedUnitSprite('tank', 'ww1', 0)).toBe(normal);
      expect(bakedUnitSprite('tank', 'interwar', 0)).toBe(normal);
      expect(bakedUnitSprite('tank', 'ww2', 0)).toBe(bakedUnitSprite('heavyTank', 'ww2', 0));
      expect(unitAssetPortrait('tank', 'ww2')).toBe(unitAssetPortrait('heavyTank', 'ww2'));
    } finally {
      UNIT_ASSETS.tank = original;
    }
  });
});

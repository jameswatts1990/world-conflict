// Seeded, serialisable PRNG (mulberry32). The generator state lives inside
// GameState.rng so saves restore the exact random sequence.
import type { GameState } from './types';

export function seedToState(seed: number): number {
  // Scramble the seed so nearby seeds diverge immediately.
  let h = (seed ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

/** Uniform float in [0, 1). Advances state.rng. */
export function random(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(state: GameState, min: number, max: number): number {
  return min + (max - min) * random(state);
}

export function randomInt(state: GameState, maxExclusive: number): number {
  return Math.floor(random(state) * maxExclusive);
}

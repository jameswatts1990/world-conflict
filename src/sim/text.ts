// Wording helpers for event and validation messages. Names that take "the" in
// running text carry the article in scenario data, so messages read
// "the United Kingdom" mid-sentence and "The United Kingdom" at the start.
import { NEUTRAL, type Article, type NationId, type OwnerId, type ProvinceId } from './types';
import type { World } from './world';

function withArticle(name: string, article?: Article): string {
  return article ? `${article} ${name}` : name;
}

/** "the United Kingdom", "France". */
export function nationName(world: World, nation: NationId): string {
  const n = world.nations[nation];
  return n ? withArticle(n.name, n.article) : nation;
}

/** "the Midlands", "the Netherlands", "Normandy". */
export function provinceName(world: World, province: ProvinceId): string {
  const p = world.provinces[province];
  return withArticle(p.name, p.article);
}

/** Whoever owns or garrisons a province: a nation, or the neutral state it belongs to. */
export function ownerName(world: World, owner: OwnerId, province?: ProvinceId): string {
  if (owner !== NEUTRAL) return nationName(world, owner);
  const state = province ? world.provinces[province].neutral : undefined;
  return state ? withArticle(state.name, state.article) : 'neutral forces';
}

/** Upper-cases the first letter, for a name that opens a sentence. */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whole seconds as "45s", "2m", "2m 30s". */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}

// Turns a run's game records into the numbers the reports, comparisons and the tuner read.
// Nations, unit types, buildings and research come from the run's catalogue, so a new country
// or unit appears in every table (and is checked by the red flags) without changes here.
import { evaluate, GOALS, type Flag, type FunReport } from './goals';
import type { Override } from './overrides';
import type { GameRecord } from './record';
import type { Catalogue } from './sim';
import { meanOf, median, quantile, rate, type Mean, type Rate } from './stats';

export interface RunMeta {
  /** "working tree", a git ref, or "defaults" (the working tree without the overrides). */
  label: string;
  commit: string;
  overrides: Override[];
  /** e.g. "1–300". */
  seeds: string;
  /** Campaigns stop here if nothing has ended them first (0: they run to their own end). */
  maxMinutes: number;
  startedAt: string;
  wallSeconds: number;
  workers: number;
  catalogue: Catalogue;
}

export interface NationSummary {
  id: string;
  name: string;
  tier: string;
  playable: boolean;
  wins: Rate;
  survived: Rate;
  /** Knocked out within GOALS.earlyMinutes. */
  knockedOutEarly: Rate;
  /** Place among the playable nations (1 = top) for playable nations; among all nations for the rest. */
  rank: Mean;
  /** Median minute it was knocked out, when it was. */
  outAt: number | null;
  provinces: Mean;
  peakProvinces: Mean;
}

export interface Band {
  label: string;
  seats: number;
  wins: Rate;
  rank: Mean;
}

export interface Summary {
  games: number;
  meta: RunMeta;
  /** Mean time one core took to play a campaign. */
  cpuSecondsPerGame: number;
  outcomes: Record<string, number>;
  endedByObjectives: Rate;
  reachedLimit: Rate;
  length: Mean & { median: number; p10: number; p90: number };
  nations: NationSummary[];
  tiers: { tier: string; seats: number; wins: Rate; survived: Rate; knockedOutEarly: Rate; outAt: number | null }[];
  /** Playable seats knocked out within GOALS.earlyMinutes. */
  earlyKnockouts: Rate;
  pace: {
    firstWar: number | null;
    /** Median minute the first playable nation is knocked out, and the share of games where one is. */
    firstKnockout: number | null;
    anyKnockout: Rate;
    perGame: Record<'wars' | 'peace' | 'captures' | 'battles' | 'withdrawals' | 'cityGrowth' | 'disbands' | 'warMinutes' | 'largestArmy', Mean>;
  };
  drama: { leadChanges: Mean & { median: number }; leaderWins: { minute: number; rate: Rate }[] };
  /** Minor powers still standing at each minute (absent when the scenario has none). */
  minors: { aliveAt: { minute: number; rate: Rate }[]; outAt: number | null } | null;
  personality: { doctrine: (Band & { adjusted: number })[]; aggression: Band[]; economyBias: Band[] };
  /** Playable nations by provinces gained in the first 20 minutes, against how they did. */
  earlyGrab: { label: string; seats: number; wins: Rate; survived: Rate }[];
  /** unlockedIn: some nation had the research; raisableIn: some nation also held every building it needs. */
  units: { id: string; name: string; unlockedIn: Rate; raisableIn: Rate; raisedIn: Rate; raised: Mean; lost: Mean }[];
  buildings: { id: string; name: string; unlockedIn: Rate; heldIn: Rate; levels: Mean }[];
  techs: { id: string; name: string; col: number; seats: Rate; winners: Rate }[];
  research: { at60: Mean; atEnd: Mean };
  fun: FunReport;
  flags: Flag[];
}

/** "1–300", or a short list. */
export function describeSeeds(seeds: readonly number[]): string {
  const s = [...seeds].sort((a, b) => a - b);
  if (s.length === 0) return 'none';
  const contiguous = s.every((x, i) => i === 0 || x === s[i - 1] + 1);
  if (contiguous) return s.length === 1 ? `${s[0]}` : `${s[0]}–${s[s.length - 1]}`;
  return s.length <= 8 ? s.join(', ') : `${s.length} seeds from ${s[0]} to ${s[s.length - 1]}`;
}

function strictLeader(game: GameRecord, minute: number): string | null {
  let best: string | null = null;
  let bestVp = -1;
  let tie = false;
  for (const [id, values] of Object.entries(game.series.vp)) {
    const vp = values[minute - 1] ?? 0;
    if (vp > bestVp) {
      best = id;
      bestVp = vp;
      tie = false;
    } else if (vp === bestVp) tie = true;
  }
  return tie || bestVp <= 0 ? null : best;
}

function bands(seats: { value: number; won: boolean; place: number }[], label: (lo: number, hi: number) => string): Band[] {
  if (seats.length === 0) return [];
  const values = seats.map((s) => s.value);
  const cuts = [Math.min(...values), quantile(values, 1 / 3), quantile(values, 2 / 3), Math.max(...values) + 1e-9];
  const out: Band[] = [];
  for (let i = 0; i < 3; i++) {
    const inBand = seats.filter((s) => s.value >= cuts[i] && s.value < cuts[i + 1]);
    out.push({ label: label(cuts[i], Math.min(cuts[i + 1], Math.max(...values))), seats: inBand.length, wins: rate(inBand.filter((s) => s.won).length, inBand.length), rank: meanOf(inBand.map((s) => s.place)) });
  }
  return out;
}

export function summarise(games: readonly GameRecord[], meta: RunMeta): Summary {
  const cat = meta.catalogue;
  const n = games.length;
  const playable = cat.nations.filter((x) => x.playable).map((x) => x.id);
  const minorIds = cat.nations.filter((x) => !x.playable).map((x) => x.id);
  const early = GOALS.earlyMinutes;
  const isOutBy = (out: number | null, minute: number) => out !== null && out <= minute;

  // Each game's playable nations in final order, for places among them.
  const placeOf = new Map<GameRecord, Map<string, number>>();
  for (const g of games) {
    const order = [...playable].sort((a, b) => g.nations[a].rank - g.nations[b].rank);
    placeOf.set(g, new Map(order.map((id, i) => [id, i + 1])));
  }

  const outcomes: Record<string, number> = {};
  for (const g of games) outcomes[g.reason ?? 'unfinished'] = (outcomes[g.reason ?? 'unfinished'] ?? 0) + 1;
  const lengths = games.map((g) => g.minutes);

  const nations: NationSummary[] = cat.nations.map((def) => {
    const recs = games.map((g) => g.nations[def.id]).filter((r) => r !== undefined);
    const outs = recs.map((r) => r.eliminatedAt).filter((m): m is number => m !== null);
    const places = games.filter((g) => g.nations[def.id]).map((g) => (def.playable ? placeOf.get(g)!.get(def.id)! : g.nations[def.id].rank));
    return {
      id: def.id,
      name: def.name,
      tier: def.tier,
      playable: def.playable,
      wins: rate(games.filter((g) => g.winner === def.id).length, recs.length),
      survived: rate(recs.filter((r) => r.eliminatedAt === null).length, recs.length),
      knockedOutEarly: rate(recs.filter((r) => isOutBy(r.eliminatedAt, early)).length, recs.length),
      rank: meanOf(places),
      outAt: outs.length > 0 ? median(outs) : null,
      provinces: meanOf(recs.map((r) => r.provinces)),
      peakProvinces: meanOf(recs.map((r) => r.peakProvinces)),
    };
  });

  const tierIds = [...new Set(cat.nations.map((x) => x.tier))];
  const tiers = tierIds.map((tier) => {
    const ids = cat.nations.filter((x) => x.tier === tier).map((x) => x.id);
    const recs = games.flatMap((g) => ids.map((id) => ({ g, id, r: g.nations[id] })).filter((x) => x.r));
    const outs = recs.map((x) => x.r.eliminatedAt).filter((m): m is number => m !== null);
    return {
      tier,
      seats: recs.length,
      wins: rate(recs.filter((x) => x.g.winner === x.id).length, recs.length),
      survived: rate(recs.filter((x) => x.r.eliminatedAt === null).length, recs.length),
      knockedOutEarly: rate(recs.filter((x) => isOutBy(x.r.eliminatedAt, early)).length, recs.length),
      outAt: outs.length > 0 ? median(outs) : null,
    };
  });

  const playableSeats = games.flatMap((g) =>
    playable
      .filter((id) => g.nations[id])
      .map((id) => ({ g, id, r: g.nations[id], place: placeOf.get(g)!.get(id)!, won: g.winner === id })),
  );

  const firstWars = games.map((g) => g.events.find((e) => e.kind === 'war')?.minute).filter((m): m is number => m !== undefined);
  const firstOuts = games.map((g) => Math.min(...playable.map((id) => g.nations[id]?.eliminatedAt ?? Infinity))).filter(Number.isFinite);
  const perGame = (f: (g: GameRecord) => number) => meanOf(games.map(f));
  const count = (g: GameRecord, kind: string) => g.events.filter((e) => e.kind === kind).length;

  const leadChanges = games.map((g) => {
    const minutes = Object.values(g.series.vp)[0]?.length ?? 0;
    let last: string | null = null;
    let changes = 0;
    for (let m = 1; m <= minutes; m++) {
      const leader = strictLeader(g, m);
      if (leader && leader !== last) {
        if (last) changes++;
        last = leader;
      }
    }
    return changes;
  });
  const leaderWins = [20, 40, 60].map((minute) => {
    const eligible = games.filter((g) => g.winner && g.minutes >= minute && strictLeader(g, minute));
    return { minute, rate: rate(eligible.filter((g) => strictLeader(g, minute) === g.winner).length, eligible.length) };
  });

  const minors =
    minorIds.length === 0
      ? null
      : {
          aliveAt: [20, 30, 40, 60]
            .filter((minute) => meta.maxMinutes === 0 || minute <= meta.maxMinutes)
            .map((minute) => {
            const flags = games.flatMap((g) => minorIds.filter((id) => g.nations[id]).map((id) => (g.nations[id].eliminatedAt ?? Infinity) > minute));
            return { minute, rate: rate(flags.filter(Boolean).length, flags.length) };
          }),
          outAt: (() => {
            const outs = games.flatMap((g) => minorIds.map((id) => g.nations[id]?.eliminatedAt)).filter((m): m is number => typeof m === 'number');
            return outs.length > 0 ? median(outs) : null;
          })(),
        };

  // AI personality against results, for playable seats. Doctrine is also compared within each
  // nation (its seats' mean place minus the nation's), so geography cannot pass for doctrine.
  const withPersonality = playableSeats.filter((s) => s.r.personality);
  const doctrines = [...new Set(withPersonality.map((s) => s.r.personality!.doctrine))].sort();
  const nationMean = new Map(playable.map((id) => [id, meanOf(withPersonality.filter((s) => s.id === id).map((s) => s.place)).mean]));
  const doctrine = doctrines.map((d) => {
    const seats = withPersonality.filter((s) => s.r.personality!.doctrine === d);
    const perNation = playable
      .map((id) => {
        const mine = seats.filter((s) => s.id === id);
        return mine.length > 0 ? meanOf(mine.map((s) => s.place)).mean - nationMean.get(id)! : null;
      })
      .filter((x): x is number => x !== null);
    return {
      label: d,
      seats: seats.length,
      wins: rate(seats.filter((s) => s.won).length, seats.length),
      rank: meanOf(seats.map((s) => s.place)),
      adjusted: meanOf(perNation).mean,
    };
  });
  const fmt = (lo: number, hi: number) => `${lo.toFixed(2)}–${hi.toFixed(2)}`;
  const personality = {
    doctrine,
    aggression: bands(
      withPersonality.map((s) => ({ value: s.r.personality!.aggression, won: s.won, place: s.place })),
      fmt,
    ),
    economyBias: bands(
      withPersonality.map((s) => ({ value: s.r.personality!.economyBias, won: s.won, place: s.place })),
      fmt,
    ),
  };

  const greatSeats = playableSeats.filter((s) => s.r.tier === 'playable');
  const gained = (s: (typeof greatSeats)[number]) => (s.g.series.provinces[s.id][19] ?? 0) - (s.g.series.provinces[s.id][0] ?? 0);
  const earlyGrab = (
    [
      ['none', -Infinity, 0],
      ['1', 1, 1],
      ['2', 2, 2],
      ['3 or more', 3, Infinity],
    ] as const
  ).map(([label, lo, hi]) => {
    const seats = greatSeats.filter((s) => s.g.minutes >= 20 && gained(s) >= lo && gained(s) <= hi);
    return { label, seats: seats.length, wins: rate(seats.filter((s) => s.won).length, seats.length), survived: rate(seats.filter((s) => s.r.eliminatedAt === null).length, seats.length) };
  });

  const researched = (g: GameRecord, tech: string | null) => tech === null || Object.values(g.nations).some((r) => r.techs.includes(tech));
  const raisable = (g: GameRecord, u: Catalogue['units'][number]) =>
    Object.values(g.nations).some(
      (r) => (u.unlockedBy === null || r.techs.includes(u.unlockedBy)) && u.requires.every((b) => (r.buildings[b as keyof typeof r.buildings] ?? 0) > 0),
    );
  const units = cat.units.map((u) => {
    const raisedPerGame = games.map((g) => Object.values(g.nations).reduce((s, r) => s + (r.recruited[u.id as keyof typeof r.recruited] ?? 0), 0));
    return {
      id: u.id,
      name: u.name,
      unlockedIn: rate(games.filter((g) => researched(g, u.unlockedBy)).length, n),
      raisableIn: rate(games.filter((g) => raisable(g, u)).length, n),
      raisedIn: rate(raisedPerGame.filter((x) => x > 0).length, n),
      raised: meanOf(raisedPerGame),
      lost: meanOf(games.map((g) => Object.values(g.nations).reduce((s, r) => s + (r.lost[u.id as keyof typeof r.lost] ?? 0), 0))),
    };
  });
  const buildings = cat.buildings.map((b) => {
    const levels = games.map((g) => Object.values(g.nations).reduce((s, r) => s + (r.buildings[b.id as keyof typeof r.buildings] ?? 0), 0));
    return {
      id: b.id,
      name: b.name,
      unlockedIn: rate(games.filter((g) => researched(g, b.unlockedBy)).length, n),
      heldIn: rate(levels.filter((x) => x > 0).length, n),
      levels: meanOf(levels),
    };
  });
  const winners = games.filter((g) => g.winner && g.nations[g.winner]);
  const techs = cat.techs.map((t) => ({
    id: t.id,
    name: t.name,
    col: t.col,
    seats: rate(playableSeats.filter((s) => s.r.techs.includes(t.id)).length, playableSeats.length),
    winners: rate(winners.filter((g) => g.nations[g.winner!].techs.includes(t.id)).length, winners.length),
  }));
  const research = {
    at60: meanOf(playableSeats.filter((s) => s.g.minutes >= 60 && !isOutBy(s.r.eliminatedAt, 60)).map((s) => s.g.series.techs[s.id][59])),
    atEnd: meanOf(playableSeats.map((s) => s.r.techs.length)),
  };

  const summary: Omit<Summary, 'fun' | 'flags'> = {
    games: n,
    meta,
    cpuSecondsPerGame: meanOf(games.map((g) => g.wallMs / 1000)).mean,
    outcomes,
    endedByObjectives: rate(outcomes.objectives ?? 0, n),
    reachedLimit: rate(games.filter((g) => g.reason === 'timeLimit' || (meta.maxMinutes > 0 && g.minutes >= meta.maxMinutes)).length, n),
    length: { ...meanOf(lengths), median: median(lengths), p10: quantile(lengths, 0.1), p90: quantile(lengths, 0.9) },
    nations,
    tiers,
    earlyKnockouts: rate(playableSeats.filter((s) => isOutBy(s.r.eliminatedAt, early)).length, playableSeats.length),
    pace: {
      firstWar: firstWars.length > 0 ? median(firstWars) : null,
      firstKnockout: firstOuts.length > 0 ? median(firstOuts) : null,
      anyKnockout: rate(firstOuts.length, n),
      perGame: {
        wars: perGame((g) => count(g, 'war')),
        peace: perGame((g) => count(g, 'peace')),
        captures: perGame((g) => count(g, 'capture')),
        battles: perGame((g) => g.activity.battles),
        withdrawals: perGame((g) => g.activity.withdrawals),
        cityGrowth: perGame((g) => g.activity.cityGrowth),
        disbands: perGame((g) => g.activity.disbands),
        warMinutes: perGame((g) => g.activity.warMinutes),
        largestArmy: perGame((g) => g.activity.largestArmy),
      },
    },
    drama: { leadChanges: { ...meanOf(leadChanges), median: median(leadChanges) }, leaderWins },
    minors,
    personality,
    earlyGrab,
    units,
    buildings,
    techs,
    research,
  };
  const { fun, flags } = evaluate(summary);
  return { ...summary, fun, flags };
}

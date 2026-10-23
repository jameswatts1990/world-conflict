// The race over the campaign, for the results screen: your line and the winner's in their
// colours, every other power as thin grey context. One measure at a time (score, objective VP
// or provinces); pointing at the chart, or the arrow keys on it, reads off a moment.
import { useEffect, useRef, useState } from 'react';
import type { GameState, HistorySample, NationId, World } from '../../sim';
import { lighten } from '../color';
import { Flag } from '../flags';
import { formatClock } from '../format';

const MEASURES = ['Score', 'Objective VP', 'Provinces'] as const;
const HEIGHT = 210;
const PAD = { left: 38, right: 128, top: 12, bottom: 24 };
/** Rows in the tooltip: the leaders at that moment (and you, if you are not among them). */
const TIP_ROWS = 6;

/** The axis top: the value rounded up to 1, 2, 4, 5 or 10 times a power of ten (quarters stay round). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 4, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

export function RaceChart({ state, world, human }: { state: GameState; world: World; human: NationId }) {
  const history: HistorySample[] = state.history ?? [];
  const [measure, setMeasure] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  if (history.length < 2) return null;

  const winner = state.outcome?.winner ?? null;
  const featured = [human, ...(winner && winner !== human ? [winner] : [])];
  const nations = world.nationIds.filter((n) => history.some((h) => h.nations[n]));
  const value = (h: HistorySample, n: NationId) => h.nations[n]?.[measure] ?? null;
  const t0 = history[0].tick;
  const t1 = history.at(-1)!.tick;
  const yMax = niceMax(Math.max(...history.flatMap((h) => nations.map((n) => value(h, n) ?? 0))));
  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (tick: number) => PAD.left + ((tick - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const path = (n: NationId) =>
    history
      .map((h) => [h, value(h, n)] as const)
      .filter(([, v]) => v !== null)
      .map(([h, v], i) => `${i ? 'L' : 'M'}${x(h.tick).toFixed(1)},${y(v!).toFixed(1)}`)
      .join('');
  const color = (n: NationId) => lighten(world.nations[n].color, 0.22);

  // Time ticks every half hour of campaign time, thinned to fit.
  const minute = 60 * state.settings.durationScale;
  const span = (t1 - t0) / minute;
  const every = [30, 60, 120].find((m) => span / m <= Math.max(2, plotW / 90)) ?? 240;
  const xTicks: number[] = [];
  for (let m = 0; m * minute <= t1; m += every) if (m * minute >= t0) xTicks.push(m * minute);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  // End labels for the featured lines, nudged apart when they would overlap.
  const ends = featured
    .map((n) => ({ n, v: value(history.at(-1)!, n) ?? 0 }))
    .map((e) => ({ ...e, ly: y(e.v) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) if (ends[i].ly - ends[i - 1].ly < 16) ends[i].ly = ends[i - 1].ly + 16;

  const sample = at === null ? null : history[at];
  const rows = sample
    ? (() => {
        const ranked = nations.filter((n) => value(sample, n) !== null).sort((a, b) => value(sample, b)! - value(sample, a)!);
        const top = ranked.slice(0, TIP_ROWS);
        if (!top.includes(human) && ranked.includes(human)) top[TIP_ROWS - 1] = human;
        return top;
      })()
    : [];
  const pick = (clientX: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    const tick = t0 + ((clientX - r.left - PAD.left) / plotW) * (t1 - t0);
    let best = 0;
    history.forEach((h, i) => {
      if (Math.abs(h.tick - tick) < Math.abs(history[best].tick - tick)) best = i;
    });
    setAt(best);
  };

  return (
    <div className="race">
      <div className="race-head">
        <div className="race-title">The race</div>
        <div className="segmented small" role="group" aria-label="Measure">
          {MEASURES.map((m, i) => (
            <button key={m} className={measure === i ? 'active' : ''} onClick={() => setMeasure(i)}>
              {m}
            </button>
          ))}
        </div>
        <div className="race-legend">
          {featured.map((n) => (
            <span key={n}>
              <svg width="16" height="8" aria-hidden>
                <line x1="1" y1="4" x2="15" y2="4" stroke={color(n)} strokeWidth={n === human ? 3 : 2} strokeLinecap="round" />
              </svg>
              <Flag id={n} size={12} /> {world.nations[n].name}
              {n === human ? ' (you)' : ' (winner)'}
            </span>
          ))}
          <span>
            <svg width="16" height="8" aria-hidden>
              <line x1="1" y1="4" x2="15" y2="4" className="race-other" />
            </svg>
            Other powers
          </span>
        </div>
      </div>
      <div
        ref={boxRef}
        className="race-plot"
        tabIndex={0}
        aria-label={`${MEASURES[measure]} over the campaign. Use the arrow keys to read it at each moment.`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setAt(null)}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const d = e.key === 'ArrowRight' ? 1 : -1;
          setAt((a) => Math.min(history.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : history.length)) + d)));
        }}
      >
        <svg width={width} height={HEIGHT} role="img" aria-hidden>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} className="race-grid" />
              <text x={PAD.left - 6} y={y(v) + 3.5} className="race-axis" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - 6} className="race-axis" textAnchor="middle">
              {formatClock(t, state).slice(0, -3)}
            </text>
          ))}
          {nations
            .filter((n) => !featured.includes(n))
            .map((n) => (
              <path key={n} d={path(n)} className="race-other" />
            ))}
          {[...featured].reverse().map((n) => (
            <g key={n}>
              <path d={path(n)} className="race-casing" strokeWidth={n === human ? 6 : 5} />
              <path d={path(n)} fill="none" stroke={color(n)} strokeWidth={n === human ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {ends.map((e) => (
            <g key={e.n}>
              <circle cx={x(t1)} cy={y(e.v)} r={4} fill={color(e.n)} className="race-end" />
              <text x={x(t1) + 10} y={e.ly + 4} className="race-end-label">
                {world.nations[e.n].name} <tspan className="race-end-value">{e.v}</tspan>
              </text>
            </g>
          ))}
          {sample && <line x1={x(sample.tick)} x2={x(sample.tick)} y1={PAD.top} y2={PAD.top + plotH} className="race-cross" />}
        </svg>
        {sample && (
          <div className="race-tip" style={{ left: Math.min(x(sample.tick) + 12, width - 190), top: PAD.top }}>
            <div className="race-tip-time">{formatClock(sample.tick, state).slice(0, -3)}</div>
            {rows.map((n) => (
              <div key={n} className={`race-tip-row${n === human ? ' me' : ''}`}>
                <svg width="12" height="6" aria-hidden>
                  <line x1="1" y1="3" x2="11" y2="3" stroke={featured.includes(n) ? color(n) : 'var(--muted)'} strokeWidth="2" strokeLinecap="round" />
                </svg>
                <strong>{value(sample, n)}</strong>
                <span>{world.nations[n].name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

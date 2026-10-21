// Classic research tree: era columns, branch rows, prerequisite lines.
// Click a technology to research it now, or to queue it together with any
// prerequisites it still needs.
import { useMemo, useState, type ReactNode } from 'react';
import { BUILDINGS } from '../../sim/config/buildings';
import { BRANCHES, ERAS, TECHS, TECH_BY_ID, type TechConfig } from '../../sim/config/research';
import { UNITS, baseGen } from '../../sim/config/units';
import {
  checkResearch,
  modelName,
  nationEra,
  researchSlots,
  researchSpeed,
  unitGen,
  type TechBranch,
  type TechId,
} from '../../sim';
import type { GameController } from '../game/GameController';
import { formatDuration } from '../format';

/** Compact m:ss for node footers. */
function formatClockShort(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
import { BuildingIcon } from '../icons';
import { BranchIcon, TechUnitIcon } from '../art/adapters';
import { Cost, Modal, Progress } from './Common';

const COL_W = 224;
const NODE_W = 198;
const NODE_H = 70;
const ROW_H = 82;
const LABEL_W = 150;
const HEAD_H = 54;
const BRANCH_GAP = 14;
const PAD = 12;

interface Layout {
  pos: Record<TechId, { x: number; y: number }>;
  branchTop: Record<TechBranch, { top: number; height: number }>;
  width: number;
  height: number;
}

function buildLayout(): Layout {
  const pos: Layout['pos'] = {};
  const branchTop = {} as Layout['branchTop'];
  let y = HEAD_H + PAD;
  for (const b of BRANCHES) {
    const techs = TECHS.filter((t) => t.branch === b.id);
    const rows = Math.max(...techs.map((t) => t.row)) + 1;
    const height = rows * ROW_H;
    branchTop[b.id] = { top: y, height };
    for (const t of techs) pos[t.id] = { x: LABEL_W + PAD + t.col * COL_W, y: y + t.row * ROW_H + (ROW_H - NODE_H) / 2 };
    y += height + BRANCH_GAP;
  }
  return { pos, branchTop, width: LABEL_W + PAD * 2 + 8 * COL_W, height: y };
}

const LAYOUT = buildLayout();

/** Every prerequisite of a technology, transitively. */
function ancestors(id: TechId, out = new Set<TechId>()): Set<TechId> {
  for (const r of TECH_BY_ID[id].requires) {
    if (!out.has(r)) {
      out.add(r);
      ancestors(r, out);
    }
  }
  return out;
}

/** Technologies to queue, in order, to reach `id` from what is done, running or queued. */
function pathTo(planned: Set<TechId>, id: TechId): TechId[] {
  const out: TechId[] = [];
  const visit = (t: TechId) => {
    if (planned.has(t) || out.includes(t)) return;
    for (const r of TECH_BY_ID[t].requires) visit(r);
    out.push(t);
  };
  visit(id);
  return out;
}

function TechIcon({ tech, ctrl }: { tech: TechConfig; ctrl: GameController }) {
  const { state, world, human } = ctrl;
  for (const e of tech.effects) {
    if (e.kind === 'unlockUnit') {
      const gen = unitGen(state, human, e.unit);
      return <TechUnitIcon type={e.unit} gen={gen} nation={human} title={modelName(world, human, e.unit, gen).name} />;
    }
    if (e.kind === 'unitModel') return <TechUnitIcon type={e.units[0]} gen={e.gen} nation={human} title={modelName(world, human, e.units[0], e.gen).name} />;
  }
  for (const e of tech.effects) if (e.kind === 'unlockBuilding') return <BuildingIcon kind={e.building} size={22} />;
  return <BranchIcon branch={tech.branch} size={20} />;
}

/** Small chips naming what a technology unlocks or upgrades. */
function unlockChips(ctrl: GameController, tech: TechConfig): ReactNode[] {
  const { world, human } = ctrl;
  const chips: ReactNode[] = [];
  for (const e of tech.effects) {
    if (e.kind === 'unlockUnit') chips.push(<span key={`u-${e.unit}`} className="chip unit">{modelName(world, human, e.unit, baseGen(e.unit)).name}</span>);
    if (e.kind === 'unlockBuilding') chips.push(<span key={`b-${e.building}`} className="chip building">{BUILDINGS[e.building].name}</span>);
    if (e.kind === 'unitModel') {
      const models = e.units.filter((u) => UNITS[u].models[e.gen]);
      if (models.length > 0) {
        const first = modelName(world, human, models[0], e.gen).name;
        chips.push(
          <span key={`m-${e.gen}`} className="chip model" title={models.map((u) => modelName(world, human, u, e.gen).name).join(', ')}>
            {first}
            {models.length > 1 ? ` +${models.length - 1}` : ''}
          </span>,
        );
      }
    }
    if (e.kind === 'researchSlot') chips.push(<span key="slot" className="chip slot">+1 research slot</span>);
  }
  return chips;
}

export function ResearchPanel({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const { state, world, human } = ctrl;
  const research = state.nations[human].research;
  const res = state.nations[human].resources;
  const [hover, setHover] = useState<TechId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const done = new Set(research.completed);
  const activeIds = new Set(research.active.map((j) => j.tech));
  const planned = new Set([...done, ...activeIds, ...research.queue]);
  const slots = researchSlots(state, human);
  const speed = researchSpeed(state, human);

  const highlight = useMemo(() => (hover ? ancestors(hover) : new Set<TechId>()), [hover]);
  const hoverPath = hover ? pathTo(planned, hover) : [];

  const onClickTech = (id: TechId) => {
    setMessage(null);
    if (done.has(id) || activeIds.has(id)) return;
    if (research.queue.includes(id)) {
      ctrl.submit({ type: 'unqueueResearch', nation: human, tech: id });
      return;
    }
    if (checkResearch(state, human, id).ok) {
      ctrl.submit({ type: 'research', nation: human, tech: id });
      return;
    }
    for (const t of pathTo(planned, id)) {
      const r = ctrl.submit({ type: 'queueResearch', nation: human, tech: t });
      if (!r.ok) {
        setMessage(`${TECH_BY_ID[t].name}: ${r.reason}`);
        break;
      }
    }
  };

  const edges: ReactNode[] = [];
  for (const t of TECHS) {
    for (const r of t.requires) {
      const a = LAYOUT.pos[r];
      const b = LAYOUT.pos[t.id];
      const x1 = a.x + NODE_W;
      const y1 = a.y + NODE_H / 2;
      const x2 = b.x;
      const y2 = b.y + NODE_H / 2;
      const mid = (x1 + x2) / 2;
      const cls = done.has(r) && done.has(t.id) ? 'done' : done.has(r) ? 'open' : 'locked';
      const lit = hover && (hover === t.id || highlight.has(t.id)) && (highlight.has(r) || r === hover);
      edges.push(
        <path
          key={`${r}>${t.id}`}
          d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
          className={`tree-edge ${cls}${lit ? ' lit' : ''}`}
        />,
      );
    }
  }

  return (
    <Modal title={`Research — ${nationEra(state, human)} era`} onClose={onClose} full>
      <div className="research-head">
        <div className="research-status">
          <div>
            <strong>
              Slots {research.active.length}/{slots}
            </strong>
            <span className="muted"> · speed {Math.round(speed * 100)}%</span>
            <div className="muted small">Universities add 10% each; research can add slots.</div>
          </div>
          {research.active.map((j) => (
            <div key={j.tech} className="research-job">
              <span>{TECH_BY_ID[j.tech].name}</span>
              <Progress value={1 - j.remaining / j.total} label={formatDuration(Math.ceil(j.remaining / speed), state)} />
              <button className="icon-btn" title="Cancel (50% refund)" onClick={() => ctrl.submit({ type: 'cancelResearch', nation: human, tech: j.tech })}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="research-queue">
          <span className="muted">Queue:</span>
          {research.queue.length === 0 && <span className="muted"> empty — click a locked technology to queue its whole path</span>}
          {research.queue.map((t, i) => (
            <button key={t} className="chip queued" title="Remove from queue (and anything that depends on it)" onClick={() => ctrl.submit({ type: 'unqueueResearch', nation: human, tech: t })}>
              {i + 1}. {TECH_BY_ID[t].name} ✕
            </button>
          ))}
        </div>
        {message && <div className="warn">{message}</div>}
      </div>

      <div className="tree-scroll">
        <div className="tree" style={{ width: LAYOUT.width, height: LAYOUT.height }}>
          {ERAS.map((era) => (
            <div
              key={era.label}
              className="tree-era"
              style={{ left: LABEL_W + PAD + era.cols[0] * COL_W - 8, width: COL_W * 2, height: LAYOUT.height }}
            >
              <div className="tree-era-title">{era.label}</div>
              <div className="tree-era-years">{era.years}</div>
            </div>
          ))}
          {BRANCHES.map((b) => (
            <div key={b.id} className="tree-branch" style={{ top: LAYOUT.branchTop[b.id].top - 6, height: LAYOUT.branchTop[b.id].height + 4 }}>
              <span className="tree-branch-label">
                <BranchIcon branch={b.id} size={18} /> {b.name}
              </span>
            </div>
          ))}
          <svg className="tree-edges" width={LAYOUT.width} height={LAYOUT.height}>
            {edges}
          </svg>
          {TECHS.map((t) => {
            const p = LAYOUT.pos[t.id];
            const isDone = done.has(t.id);
            const job = research.active.find((j) => j.tech === t.id);
            const qIndex = research.queue.indexOf(t.id);
            const available = !isDone && !job && t.requires.every((r) => done.has(r));
            const startable = checkResearch(state, human, t.id).ok;
            const inPath = hoverPath.includes(t.id) && !isDone && !job && qIndex < 0;
            const cls = [
              'tree-node',
              isDone ? 'done' : job ? 'active' : qIndex >= 0 ? 'queued' : available ? 'available' : 'locked',
              hover === t.id ? 'hovered' : '',
              highlight.has(t.id) ? 'ancestor' : '',
              inPath ? 'in-path' : '',
            ].join(' ');
            const hint = isDone
              ? 'Researched'
              : job
                ? 'In progress'
                : qIndex >= 0
                  ? 'Queued — click to remove'
                  : startable
                    ? 'Click to research now'
                    : 'Click to queue (with any missing prerequisites)';
            return (
              <button
                key={t.id}
                className={cls}
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                onClick={() => onClickTech(t.id)}
                onMouseEnter={() => setHover(t.id)}
                onMouseLeave={() => setHover((h) => (h === t.id ? null : h))}
                data-tech={t.id}
                title={`${t.name}\n\n${t.description}${t.requires.length ? `\n\nRequires: ${t.requires.map((r) => TECH_BY_ID[r].name).join(', ')}` : ''}\n\n${hint}`}
              >
                <span className="tn-icon">
                  <TechIcon tech={t} ctrl={ctrl} />
                </span>
                <span className="tn-body">
                  <span className="tn-name">
                    {isDone ? '✓ ' : ''}
                    {t.name}
                  </span>
                  <span className="tn-chips">{unlockChips(ctrl, t).slice(0, 2)}</span>
                  {job ? (
                    <Progress value={1 - job.remaining / job.total} label={formatDuration(Math.ceil(job.remaining / speed), state)} />
                  ) : !isDone ? (
                    <span className="tn-foot">
                      <Cost cost={t.cost} have={res} />
                      <span className="muted tn-time">{formatClockShort(t.seconds)}</span>
                    </span>
                  ) : null}
                </span>
                {qIndex >= 0 && <span className="tn-badge">{qIndex + 1}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="tree-legend muted">
        <span className="lg-node done" /> researched <span className="lg-node available" /> available <span className="lg-node active" /> in progress{' '}
        <span className="lg-node queued" /> queued <span className="lg-node locked" /> needs prerequisites · Hover to trace a path; click to research or
        queue it with its prerequisites. Unit pictures show the equipment a technology brings.
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        Interwar era after 3 technologies from the Twenties onwards; Second World War after 3 from 1935 onwards. {world.scenario.name}.
      </div>
    </Modal>
  );
}

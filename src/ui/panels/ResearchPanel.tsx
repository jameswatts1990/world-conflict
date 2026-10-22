// Classic research tree: era columns, branch rows, prerequisite lines.
// Click a technology to research it now, or to queue it together with any
// prerequisites it still needs. Phones get the same technologies as a list,
// one branch at a time; on any touch screen a tap opens a technology's details,
// and the order is given from there.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BUILDINGS } from '../../sim/config/buildings';
import { BRANCHES, ERAS, ERA_RULES, RESEARCH_RULES, TECHS, TECH_BY_ID, type TechConfig } from '../../sim/config/research';
import { UNITS, baseGen } from '../../sim/config/units';
import {
  canAfford,
  checkResearch,
  durationText,
  modelName,
  nationEra,
  nextQueuedResearch,
  researchSlots,
  researchSpeed,
  unitGen,
  type TechBranch,
  type TechId,
} from '../../sim';
import type { GameController } from '../game/GameController';
import { costParts, formatDuration, shortfallText } from '../format';
import { BranchIcon, BuildingGlyphArt, TechUnitIcon } from '../art/adapters';
import { Icon } from '../icons';
import { useLayout, useTouch } from '../layout';
import { Cost, Modal, Progress, useEscape } from './Common';

/** Compact m:ss for node footers. */
function formatClockShort(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

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

/** Branch names short enough for a phone's tab row. */
const BRANCH_SHORT: Record<TechBranch, string> = {
  infantry: 'Infantry',
  artillery: 'Artillery',
  armour: 'Armour',
  industry: 'Industry',
  logistics: 'Logistics',
  society: 'Society',
};

const eraOf = (t: TechConfig) => ERAS.find((e) => t.col >= e.cols[0] && t.col <= e.cols[1])!;

type TechState = 'done' | 'active' | 'queued' | 'available' | 'locked';

/** Where a technology stands for the player; also its CSS class in the tree and the list. */
function techState(ctrl: GameController, id: TechId): TechState {
  const r = ctrl.state.nations[ctrl.human].research;
  if (r.completed.includes(id)) return 'done';
  if (r.active.some((j) => j.tech === id)) return 'active';
  if (r.queue.includes(id)) return 'queued';
  return TECH_BY_ID[id].requires.every((q) => r.completed.includes(q)) ? 'available' : 'locked';
}

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
  for (const e of tech.effects) if (e.kind === 'unlockBuilding') return <BuildingGlyphArt kind={e.building} size={24} />;
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
    if (e.kind === 'researchSlot') chips.push(<span key="slot" className="chip perk">+1 research slot</span>);
    if (e.kind === 'alliedSight') chips.push(<span key="sight" className="chip perk">Allies' sight</span>);
  }
  return chips;
}

export function ResearchPanel({ ctrl, onClose }: { ctrl: GameController; onClose: () => void }) {
  const { state, human } = ctrl;
  const research = state.nations[human].research;
  const res = state.nations[human].resources;
  // Phones list one branch at a time; touch screens show a technology before ordering it.
  const compact = useLayout() !== 'desktop';
  const touch = useTouch();
  const preview = compact || touch;
  const [hover, setHover] = useState<TechId | null>(null);
  const [selected, setSelected] = useState<TechId | null>(null);
  const [branch, setBranch] = useState<TechBranch>(() => {
    const first = research.active[0]?.tech ?? research.queue[0];
    return first ? TECH_BY_ID[first].branch : BRANCHES[0].id;
  });
  const [message, setMessage] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const done = new Set(research.completed);
  const activeIds = new Set(research.active.map((j) => j.tech));
  const planned = new Set([...done, ...activeIds, ...research.queue]);
  const slots = researchSlots(state, human);
  const speed = researchSpeed(state, human);
  const next = research.active.length < slots ? nextQueuedResearch(state, human) : null;
  const waitingFor = next && costParts(next.shortfall).length ? shortfallText(next.shortfall) : null;
  const refund = `${Math.round(RESEARCH_RULES.cancelRefund * 100)}% refund`;

  // The path traced through the tree: the technology pointed at or, on touch screens, the one shown.
  const traced = hover ?? selected;
  const highlight = useMemo(() => (traced ? ancestors(traced) : new Set<TechId>()), [traced]);
  const tracedPath = traced ? pathTo(planned, traced) : [];

  /** Show a technology's details, on its branch's tab, scrolled into view. */
  const select = (id: TechId) => {
    setMessage(null);
    setSelected(id);
    setBranch(TECH_BY_ID[id].branch);
  };
  useEffect(() => {
    if (selected) viewRef.current?.querySelector(`[data-tech="${selected}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected, branch]);

  /** Research a technology now, or queue it with the prerequisites it still needs. */
  const commit = (id: TechId) => {
    setMessage(null);
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

  const onClickTech = (id: TechId) => {
    if (preview) {
      select(id);
      return;
    }
    setMessage(null);
    if (done.has(id) || activeIds.has(id)) return;
    if (research.queue.includes(id)) ctrl.submit({ type: 'unqueueResearch', nation: human, tech: id });
    else commit(id);
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
      const lit = traced && (traced === t.id || highlight.has(t.id)) && (highlight.has(r) || r === traced);
      edges.push(
        <path
          key={`${r}>${t.id}`}
          d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
          className={`tree-edge ${cls}${lit ? ' lit' : ''}`}
        />,
      );
    }
  }

  const tree = (
    <div className="tree-scroll" ref={viewRef}>
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
          const st = techState(ctrl, t.id);
          const job = research.active.find((j) => j.tech === t.id);
          const qIndex = research.queue.indexOf(t.id);
          const startable = checkResearch(state, human, t.id).ok;
          const inPath = tracedPath.includes(t.id) && (st === 'available' || st === 'locked');
          const cls = [
            'tree-node',
            st,
            hover === t.id ? 'hovered' : '',
            selected === t.id ? 'selected' : '',
            highlight.has(t.id) ? 'ancestor' : '',
            inPath ? 'in-path' : '',
          ].join(' ');
          const hint =
            st === 'done'
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
              onMouseEnter={touch ? undefined : () => setHover(t.id)}
              onMouseLeave={touch ? undefined : () => setHover((h) => (h === t.id ? null : h))}
              data-tech={t.id}
              title={preview ? undefined : `${t.name}\n\n${t.description}${t.requires.length ? `\n\nRequires: ${t.requires.map((r) => TECH_BY_ID[r].name).join(', ')}` : ''}\n\n${hint}`}
            >
              <span className="tn-icon">
                <TechIcon tech={t} ctrl={ctrl} />
              </span>
              <span className="tn-body">
                <span className="tn-name">
                  {st === 'done' && <Icon name="check" size={12} />}
                  <span className="tn-title">{t.name}</span>
                </span>
                <span className="tn-chips">{unlockChips(ctrl, t).slice(0, 2)}</span>
                {job ? (
                  <Progress value={1 - job.remaining / job.total} label={formatDuration(Math.ceil(job.remaining / speed), state)} />
                ) : st !== 'done' ? (
                  <span className="tn-foot">
                    <Cost cost={t.cost} have={res} />
                    <span className="muted tn-time" title="Research time at your current speed">
                      {formatClockShort(t.seconds / speed)}
                    </span>
                  </span>
                ) : null}
              </span>
              {qIndex >= 0 && <span className="tn-badge">{qIndex + 1}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const detail = selected && (
    <TechDetail
      key={selected}
      ctrl={ctrl}
      id={selected}
      planned={planned}
      speed={speed}
      message={message}
      onSelect={select}
      onCommit={commit}
      onClose={() => setSelected(null)}
    />
  );

  return (
    <Modal
      title="Research"
      icon="research"
      subtitle={`${nationEra(state, human)} era · ${research.completed.length} of ${TECHS.length} technologies researched`}
      onClose={onClose}
      size="full"
    >
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
              {preview ? (
                <button className="td-link" onClick={() => select(j.tech)}>
                  {TECH_BY_ID[j.tech].name}
                </button>
              ) : (
                <span>{TECH_BY_ID[j.tech].name}</span>
              )}
              <Progress value={1 - j.remaining / j.total} label={formatDuration(Math.ceil(j.remaining / speed), state)} />
              <button className="icon-btn" title={`Cancel (${refund})`} onClick={() => ctrl.submit({ type: 'cancelResearch', nation: human, tech: j.tech })}>
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="research-queue">
          <span className="muted">Queue:</span>
          {research.queue.length === 0 && (
            <span className="muted"> empty — {preview ? 'tap a locked technology to queue its whole path' : 'click a locked technology to queue its whole path'}</span>
          )}
          {research.queue.map((t, i) =>
            preview ? (
              <button key={t} className="chip queued" onClick={() => select(t)}>
                {i + 1}. {TECH_BY_ID[t].name}
              </button>
            ) : (
              <button key={t} className="chip queued" title="Remove from queue (and anything that depends on it)" onClick={() => ctrl.submit({ type: 'unqueueResearch', nation: human, tech: t })}>
                {i + 1}. {TECH_BY_ID[t].name} <Icon name="close" size={11} />
              </button>
            ),
          )}
        </div>
        {waitingFor && (
          <div className="warn pending" data-testid="research-waiting">
            <Icon name="clock" size={13} /> Waiting for funds: {TECH_BY_ID[next!.tech].name} needs another {waitingFor}.
          </div>
        )}
        {message && !selected && (
          <div className="warn">
            <Icon name="warning" size={13} /> {message}
          </div>
        )}
      </div>

      {compact ? (
        <div className="research-phone">
          <div className="tech-tabs" role="tablist" aria-label="Branches">
            {BRANCHES.map((b) => {
              const techs = TECHS.filter((t) => t.branch === b.id);
              return (
                <button key={b.id} role="tab" aria-selected={branch === b.id} className={branch === b.id ? 'active' : ''} onClick={() => setBranch(b.id)} data-branch={b.id}>
                  <span className="tt-top">
                    <BranchIcon branch={b.id} size={18} />
                    <span className="tt-count">
                      {techs.filter((t) => done.has(t.id)).length}/{techs.length}
                    </span>
                  </span>
                  <span className="tt-name">{BRANCH_SHORT[b.id]}</span>
                </button>
              );
            })}
          </div>
          <div className="research-phone-main">
            <div className="tech-list" ref={viewRef}>
              {ERAS.map((era) => {
                const techs = TECHS.filter((t) => t.branch === branch && eraOf(t) === era).sort((a, b) => a.col - b.col || a.row - b.row);
                if (techs.length === 0) return null;
                return (
                  <section key={era.label}>
                    <h5 className="tl-era">
                      {era.label} <span className="muted">{era.years}</span>
                    </h5>
                    {techs.map((t) => (
                      <TechRow
                        key={t.id}
                        ctrl={ctrl}
                        tech={t}
                        speed={speed}
                        selected={selected === t.id}
                        inPath={tracedPath.includes(t.id)}
                        onSelect={() => select(t.id)}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
            {detail}
          </div>
        </div>
      ) : (
        <>
          {tree}
          {detail || (
            <>
              <div className="tree-legend muted">
                <span className="lg-node done" /> researched <span className="lg-node available" /> available <span className="lg-node active" /> in
                progress <span className="lg-node queued" /> queued <span className="lg-node locked" /> needs prerequisites ·{' '}
                {touch ? 'Tap one for its details and to research or queue it' : 'Hover to trace a path; click to research or queue it'} with its
                prerequisites. Unit pictures show the equipment a technology brings.
              </div>
              <div className="muted small research-era-note" style={{ marginTop: 4 }}>
                Your nation enters the Interwar era after {ERA_RULES.interwar.count} technologies from the Twenties onwards, and the Second World War after{' '}
                {ERA_RULES.ww2.count} from 1935 onwards. Equipment upgrades reach every existing unit of the type.
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/** One technology in the phone list: its state, what it brings, and its cost or what it still needs. */
function TechRow({
  ctrl,
  tech: t,
  speed,
  selected,
  inPath,
  onSelect,
}: {
  ctrl: GameController;
  tech: TechConfig;
  speed: number;
  selected: boolean;
  inPath: boolean;
  onSelect: () => void;
}) {
  const { state, human } = ctrl;
  const research = state.nations[human].research;
  const st = techState(ctrl, t.id);
  const job = research.active.find((j) => j.tech === t.id);
  const qIndex = research.queue.indexOf(t.id);
  const missing = t.requires.filter((r) => !research.completed.includes(r));
  const chips = unlockChips(ctrl, t);
  return (
    <button className={`tech-row ${st}${selected ? ' selected' : ''}${inPath && (st === 'available' || st === 'locked') ? ' in-path' : ''}`} onClick={onSelect} data-tech={t.id}>
      <span className="tn-icon">
        <TechIcon tech={t} ctrl={ctrl} />
      </span>
      <span className="tr-body">
        <span className="tn-name">
          {st === 'done' && <Icon name="check" size={13} />}
          <span className="tn-title">{t.name}</span>
        </span>
        {chips.length > 0 && <span className="tn-chips">{chips.slice(0, 3)}</span>}
        {job ? (
          <Progress value={1 - job.remaining / job.total} label={formatDuration(Math.ceil(job.remaining / speed), state)} />
        ) : st === 'done' ? null : st === 'locked' ? (
          <span className="tr-needs">Needs {missing.map((r) => TECH_BY_ID[r].name).join(' and ')}</span>
        ) : (
          <span className="tn-foot">
            <Cost cost={t.cost} have={state.nations[human].resources} />
            <span className="muted tn-time">{formatClockShort(t.seconds / speed)}</span>
          </span>
        )}
      </span>
      {qIndex >= 0 ? <span className="tn-badge">{qIndex + 1}</span> : <span className="tr-chev">›</span>}
    </button>
  );
}

/**
 * A technology's details and its one order: research it now, queue it with the
 * prerequisites it still needs, take it off the queue, or cancel it. On touch
 * screens this is the only way to order research, so a tap never spends by accident.
 */
function TechDetail({
  ctrl,
  id,
  planned,
  speed,
  message,
  onSelect,
  onCommit,
  onClose,
}: {
  ctrl: GameController;
  id: TechId;
  planned: Set<TechId>;
  speed: number;
  message: string | null;
  onSelect: (id: TechId) => void;
  onCommit: (id: TechId) => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const [armed, setArmed] = useState(false);
  const { state, human } = ctrl;
  const nation = state.nations[human];
  const research = nation.research;
  const t = TECH_BY_ID[id];
  const era = eraOf(t);
  const st = techState(ctrl, id);
  const job = research.active.find((j) => j.tech === id);
  const qIndex = research.queue.indexOf(id);
  const startable = checkResearch(state, human, id).ok;
  const path = pathTo(planned, id);
  const chips = unlockChips(ctrl, t);
  const leadsTo = TECHS.filter((x) => x.requires.includes(id));
  const refund = Math.round(RESEARCH_RULES.cancelRefund * 100);
  // Queued technologies that leave the queue with this one.
  const dependents = research.queue.filter((q) => q !== id && ancestors(q).has(id));
  const slotsBusy = research.active.length >= researchSlots(state, human);

  const link = (r: TechId) => (
    <button key={r} className={`td-link ${techState(ctrl, r)}`} onClick={() => onSelect(r)}>
      {techState(ctrl, r) === 'done' && <Icon name="check" size={12} />}
      {TECH_BY_ID[r].name}
    </button>
  );

  return (
    <section className="tech-detail" data-testid="tech-detail" data-tech-detail={id}>
      <header className="td-head">
        <span className="tn-icon">
          <TechIcon tech={t} ctrl={ctrl} />
        </span>
        <div className="td-titles">
          <h3>{t.name}</h3>
          <div className="muted small td-sub" title={era.years}>
            {BRANCHES.find((b) => b.id === t.branch)!.name} · {era.label}
          </div>
        </div>
        <button className="icon-btn close-btn" onClick={onClose} aria-label="Close details">
          <Icon name="close" size={16} />
        </button>
      </header>
      <p className="td-desc">{t.description}</p>
      <dl className="td-facts">
        {chips.length > 0 && (
          <>
            <dt>Brings</dt>
            <dd className="td-chips">{chips}</dd>
          </>
        )}
        {t.requires.length > 0 && (
          <>
            <dt>Needs</dt>
            <dd>{t.requires.map(link)}</dd>
          </>
        )}
        {leadsTo.length > 0 && (
          <>
            <dt>Leads to</dt>
            <dd>{leadsTo.map((x) => link(x.id))}</dd>
          </>
        )}
        {st !== 'done' && !job && (
          <>
            <dt>Cost</dt>
            <dd>
              <Cost cost={t.cost} have={nation.resources} /> <span className="muted">· {durationText(t.seconds / speed)}</span>
            </dd>
          </>
        )}
      </dl>

      <div className="td-action">
        {st === 'done' ? (
          <div className="notice">
            <Icon name="check" size={15} /> Researched
          </div>
        ) : job ? (
          <>
            <Progress value={1 - job.remaining / job.total} label={`${formatDuration(Math.ceil(job.remaining / speed), state)} left`} />
            <button
              className={armed ? 'danger' : ''}
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  setTimeout(() => setArmed(false), 2500);
                  return;
                }
                ctrl.submit({ type: 'cancelResearch', nation: human, tech: id });
              }}
              data-testid="research-action"
            >
              {armed ? `Sure? ${refund}% back` : 'Cancel research'}
            </button>
          </>
        ) : qIndex >= 0 ? (
          <>
            <span className="muted">
              Queued, number {qIndex + 1}
              {dependents.length > 0 && ` · removing it also removes ${dependents.map((q) => TECH_BY_ID[q].name).join(', ')}`}
            </span>
            <button onClick={() => ctrl.submit({ type: 'unqueueResearch', nation: human, tech: id })} data-testid="research-action">
              Remove from queue
            </button>
          </>
        ) : startable ? (
          <button className="primary" onClick={() => onCommit(id)} data-testid="research-action">
            Research now
          </button>
        ) : (
          <>
            {path.length > 1 && <span className="td-path">{path.map((q) => TECH_BY_ID[q].name).join(' → ')}</span>}
            <button className="primary" onClick={() => onCommit(id)} data-testid="research-action">
              {path.length > 1 ? `Queue ${path.length} technologies` : 'Add to queue'}
            </button>
            <span className="muted small">
              {path.length > 1
                ? 'They start in order, as slots and funds allow.'
                : slotsBusy
                  ? 'It starts when a research slot is free.'
                  : !canAfford(nation.resources, t.cost)
                    ? 'It starts once you can afford it.'
                    : 'It starts when its prerequisites are done.'}
            </span>
          </>
        )}
      </div>
      {message && (
        <div className="warn">
          <Icon name="warning" size={13} /> {message}
        </div>
      )}
    </section>
  );
}

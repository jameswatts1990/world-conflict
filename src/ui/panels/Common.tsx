import { useEffect, useRef, type ReactNode } from 'react';
import type { MoraleFactor, PartialResources, Resources } from '../../sim';
import { costParts, fmt } from '../format';
import { Icon, RESOURCE_LABEL, ResourceIcon, type IconName } from '../icons';

export function Cost({ cost, have }: { cost: PartialResources; have?: Resources }) {
  return (
    <span className="cost">
      {costParts(cost).map(({ key, amount }) => (
        <span key={key} className={`cost-item${have && have[key] < amount ? ' short' : ''}`} title={RESOURCE_LABEL[key]}>
          <ResourceIcon kind={key} size={12} />
          {fmt(amount)}
        </span>
      ))}
    </span>
  );
}

/** "0.75", "1.5", "5": upkeep figures keep their fractions. */
export function fmtUpkeep(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Upkeep a minute, per resource. With `net`, a resource the upkeep would push (or has pushed) below zero a minute
 * shows red.
 */
export function Upkeep({ upkeep, net, label = 'Upkeep' }: { upkeep: PartialResources; net?: Resources; label?: string }) {
  const parts = costParts(upkeep);
  if (parts.length === 0) return null;
  return (
    <span className="cost upkeep" title={`${label} a minute: ${parts.map(({ key, amount }) => `${fmtUpkeep(amount)} ${RESOURCE_LABEL[key].toLowerCase()}`).join(', ')}`}>
      <span className="upkeep-label">{label}</span>
      {parts.map(({ key, amount }) => (
        <span key={key} className={`cost-item${net && net[key] - amount < 0 ? ' short' : ''}`}>
          <ResourceIcon kind={key} size={11} />
          {fmtUpkeep(amount)}
        </span>
      ))}
      <span className="upkeep-unit">/min</span>
    </span>
  );
}

export function Progress({ value, label, tone, color }: { value: number; label?: string; tone?: 'gold' | 'red' | 'blue'; color?: string }) {
  return (
    <div className={`progress${tone ? ` ${tone}` : ''}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, ...(color ? { background: color } : {}) }} />
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}

export function Section({ title, icon, extra, children }: { title: string; icon?: IconName; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="section">
      <h4 className="section-title">
        {icon && <Icon name={icon} size={14} />}
        <span>{title}</span>
        {extra && <span className="section-extra">{extra}</span>}
      </h4>
      {children}
    </div>
  );
}

// Open dialogs close on Escape, innermost first. The listener runs in the capture
// phase so the game's own Escape handling (cancel move, clear selection) is skipped.
const escapeStack: { close: () => void }[] = [];

function onEscape(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || escapeStack.length === 0) return;
  e.stopPropagation();
  escapeStack[escapeStack.length - 1].close();
}

/** Closes the calling dialog on Escape while it is the innermost one open. */
export function useEscape(onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const entry = { close: () => latest.current() };
    escapeStack.push(entry);
    if (escapeStack.length === 1) window.addEventListener('keydown', onEscape, true);
    return () => {
      escapeStack.splice(escapeStack.indexOf(entry), 1);
      if (escapeStack.length === 0) window.removeEventListener('keydown', onEscape, true);
    };
  }, []);
}

export function Modal({
  title,
  icon,
  subtitle,
  onClose,
  children,
  size,
}: {
  title: string;
  icon?: IconName;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** 'full' is nearly full-screen (research tree). */
  size?: 'wide' | 'medium' | 'narrow' | 'full';
}) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${size ? ` ${size}` : ''}`} role="dialog" aria-label={title}>
        <header className="modal-header">
          {icon && (
            <span className="modal-icon">
              <Icon name={icon} size={20} />
            </span>
          )}
          <div className="modal-titles">
            <h2>{title}</h2>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function moraleClass(value: number): string {
  return value >= 60 ? 'high' : value >= 35 ? 'mid' : 'low';
}

/** Morale 0–100 with its target and, on hover, every contributing factor. */
export function MoraleMeter({ value, target, factors }: { value: number; target?: number; factors?: MoraleFactor[] }) {
  const tip = factors?.length
    ? `${factors.map((f) => `${f.value > 0 ? '+' : ''}${f.value}  ${f.label}`).join('\n')}\n= ${Math.round(target ?? value)} target`
    : undefined;
  const arrow = target === undefined || Math.abs(target - value) < 1 ? '' : target > value ? ' ↗' : ' ↘';
  return (
    <div className={`progress morale ${moraleClass(value)}`} title={tip} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      {target !== undefined && <div className="morale-target" style={{ left: `${Math.max(0, Math.min(100, target))}%` }} />}
      <span className="progress-label">
        {Math.round(value)}
        {arrow}
        {target !== undefined && arrow ? ` ${Math.round(target)}` : ''}
      </span>
    </div>
  );
}

/** Asks before an action that is hard to undo. */
export function ConfirmDialog({
  title,
  icon,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  icon: IconName;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <Modal title={title} icon={icon} onClose={onCancel} size="narrow">
      <div className="confirm-text">{children}</div>
      <div className="btn-row confirm-actions">
        {/* Enter picks the safe choice for dangerous actions. */}
        <button onClick={onCancel} autoFocus={danger}>
          Cancel
        </button>
        <button className={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus={!danger} data-testid="confirm">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import type { PartialResources, Resources } from '../../sim';
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
  size?: 'wide' | 'medium' | 'narrow';
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

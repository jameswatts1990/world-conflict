import type { ReactNode } from 'react';
import type { MoraleFactor, PartialResources, Resources } from '../../sim';
import { costParts, fmt } from '../format';
import { RESOURCE_LABEL, ResourceIcon } from '../icons';

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

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
  full,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Nearly full-screen (research tree). */
  full?: boolean;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}${full ? ' full' : ''}`} role="dialog" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function NationSwatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} />;
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

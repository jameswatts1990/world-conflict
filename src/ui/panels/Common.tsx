import type { ReactNode } from 'react';
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

export function Modal({
  title,
  icon,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  icon?: IconName;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
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

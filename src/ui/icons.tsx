// Resource icons. Unit, building and branch artwork lives in src/ui/art.
import type { ReactElement } from 'react';
import type { ResourceKey } from '../sim';

interface IconProps {
  size?: number;
  className?: string;
  title?: string;
}

const RESOURCE_PATHS: Record<ResourceKey, ReactElement> = {
  money: (
    <>
      <circle cx="10" cy="10" r="7.5" fill="#d6b25e" stroke="#8a6b22" strokeWidth="1.2" />
      <path d="M12.6 6.6c-.6-.7-1.6-1-2.6-1-1.7 0-2.6.9-2.6 2 0 2.6 5.4 1.4 5.4 4.2 0 1.1-1 2-2.8 2-1.1 0-2.1-.4-2.8-1.1M10 4v12" stroke="#5c4613" strokeWidth="1.3" fill="none" />
    </>
  ),
  materials: (
    <>
      <path d="M3 8h14v8H3z" fill="#9aa4ad" stroke="#4d565e" strokeWidth="1.2" />
      <path d="M5 4h10v4H5z" fill="#b8c1c9" stroke="#4d565e" strokeWidth="1.2" />
      <path d="M7 12h6" stroke="#4d565e" strokeWidth="1.2" />
    </>
  ),
  fuel: (
    <path d="M10 2.5c3 4 5.5 6.8 5.5 9.7A5.5 5.5 0 0 1 4.5 12.2C4.5 9.3 7 6.5 10 2.5z" fill="#4b4f57" stroke="#c9ccd2" strokeWidth="1.1" />
  ),
  manpower: (
    <>
      <circle cx="10" cy="6" r="3.2" fill="#c9a27e" stroke="#5e4630" strokeWidth="1.1" />
      <path d="M4 17c.5-4 3-6 6-6s5.5 2 6 6z" fill="#6f7f5a" stroke="#38412c" strokeWidth="1.1" />
    </>
  ),
};

export function ResourceIcon({ kind, size = 16, title }: IconProps & { kind: ResourceKey }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? kind}>
      {title && <title>{title}</title>}
      {RESOURCE_PATHS[kind]}
    </svg>
  );
}

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  money: 'Money',
  materials: 'Industrial materials',
  fuel: 'Fuel',
  manpower: 'Manpower',
};

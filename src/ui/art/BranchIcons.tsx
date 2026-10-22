// Monochrome research-branch glyphs (20x20, currentColor).
import type { ReactElement } from 'react';

export type ResearchBranch = 'infantry' | 'artillery' | 'armour' | 'industry' | 'logistics' | 'society';

function gearPath(cx: number, cy: number, teeth: number, rOut: number, rIn: number, rHole: number): string {
  const step = (Math.PI * 2) / teeth;
  const pt = (a: number, r: number): string => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    d += `${i === 0 ? 'M' : 'L'}${pt(a - step * 0.3, rIn)}L${pt(a - step * 0.17, rOut)}L${pt(a + step * 0.17, rOut)}L${pt(a + step * 0.3, rIn)}`;
  }
  d += `zM${(cx + rHole).toFixed(2)} ${cy}a${rHole} ${rHole} 0 1 0 ${-2 * rHole} 0a${rHole} ${rHole} 0 1 0 ${2 * rHole} 0z`;
  return d;
}

const GEAR = gearPath(10, 10, 8, 8.8, 6.4, 2.6);

const BRANCH_GLYPHS: Record<ResearchBranch, ReactElement> = {
  // steel helmet with chin strap
  infantry: (
    <>
      <path d="M3.4 11.6C3.4 6.6 6.3 3.4 10 3.4s6.6 3.2 6.6 8.2z" />
      <path d="M.9 12.4h18.2l-1.6 2.3H2.5z" />
      <path d="M6.4 15.6c1 1.8 2.2 2.6 3.6 2.6s2.6-.8 3.6-2.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  // field gun: barrel, shield, spoked wheel, trail
  artillery: (
    <>
      <path d="M6.3 9.9l12.1-6.7 1.2 2.2L7.6 12.7zM1 17.4l6.4-4.6 1 1.4-6.4 4.5z" />
      <path fillRule="evenodd" d="M8 8.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      <path d="M7.4 10.4h1.2v6.2H7.4zM4.9 12.9h6.2v1.2H4.9zM7.2 12.3a1.2 1.2 0 1 1 1.6 1.6 1.2 1.2 0 0 1-1.6-1.6z" />
    </>
  ),
  // tank
  armour: (
    <path fillRule="evenodd" d="M3.6 12.4l1.3-3h10.6l1.8 3zM7 9.4V7.1c0-.9.7-1.6 1.6-1.6h3.3c.9 0 1.6.7 1.6 1.6v2.3zM13 6.4h6.2v1.4H13zM3.4 12.9h13.2a2.4 2.4 0 0 1 0 4.8H3.4a2.4 2.4 0 0 1 0-4.8zm.4 1.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zm4.2 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zm4.2 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zm4.1 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z" />
  ),
  // gear
  industry: <path fillRule="evenodd" d={GEAR} />,
  // railway lines running to the horizon
  logistics: (
    <path d="M2.4 19L8.7 1.5h1.2L4.8 19zM17.6 19L11.3 1.5h-1.2L15.2 19zM2.6 16.4h14.8v1.7H2.6zM4.4 11.8h11.2v1.4H4.4zM5.9 8h8.2v1.2H5.9zM7.1 4.9h5.8v1H7.1zM8 2.6h4v.8H8z" />
  ),
  // megaphone with sound arcs
  society: (
    <>
      <path d="M1.6 7.8h3.2l8.6-4.6v13.6l-8.6-4.6H1.6zM5 12.4h2.6l1.3 4.8H6.3z" />
      <path d="M15.4 7.4a3.6 3.6 0 0 1 0 5.2M17.4 5.4a6.4 6.4 0 0 1 0 9.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
};

export function BranchIcon({ branch, size = 18, title }: { branch: ResearchBranch; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={title ?? branch} fill="currentColor">
      {title && <title>{title}</title>}
      {BRANCH_GLYPHS[branch]}
    </svg>
  );
}

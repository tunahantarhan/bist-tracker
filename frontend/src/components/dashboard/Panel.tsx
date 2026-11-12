import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type Accent = 'blue' | 'amber' | 'emerald' | 'slate';

export const ACCENT = {
  blue: { text: 'text-blue-400', soft: 'bg-blue-500/10', border: 'border-blue-500/25', bar: 'bg-blue-500', ring: 'border-l-blue-500' },
  amber: { text: 'text-amber-400', soft: 'bg-amber-500/10', border: 'border-amber-500/25', bar: 'bg-amber-400', ring: 'border-l-amber-400' },
  emerald: { text: 'text-emerald-400', soft: 'bg-emerald-500/10', border: 'border-emerald-500/25', bar: 'bg-emerald-400', ring: 'border-l-emerald-400' },
  slate: { text: 'text-slate-400', soft: 'bg-slate-800/60', border: 'border-slate-700', bar: 'bg-slate-500', ring: 'border-l-slate-400' },
} as const;

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-2xl border border-slate-800/80 bg-[#12161f] ${className}`}>{children}</section>;
}

/** Mono, letter-spaced section label shared with the landing page. */
export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-data text-[11px] uppercase tracking-[0.16em] ${className}`}>{children}</span>;
}

export function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  accent = 'slate',
  count,
  right,
  onToggle,
  open,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  accent?: Accent;
  count?: number;
  right?: React.ReactNode;
  onToggle?: () => void;
  open?: boolean;
}) {
  const a = ACCENT[accent];
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${a.border} ${a.soft}`}>
            <Icon className={`h-4 w-4 ${a.text}`} />
          </span>
        )}
        <div className="min-w-0 text-left">
          <Eyebrow className="text-slate-300">{title}</Eyebrow>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {count !== undefined && (
          <span className="rounded-md bg-slate-800/70 px-1.5 py-0.5 font-data text-[11px] text-slate-300">{count}</span>
        )}
        {onToggle && (
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-300 ${open ? '' : '-rotate-90'}`} />
        )}
      </div>
    </>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3 transition-colors hover:bg-slate-800/30"
      >
        {content}
      </button>
    );
  }
  return <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">{content}</div>;
}

/** Height animation via grid rows (0fr -> 1fr), no measuring needed. */
export function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      inert={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-xs leading-relaxed text-slate-500">{children}</div>;
}

export function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatPrice(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

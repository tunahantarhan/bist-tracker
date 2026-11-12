'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { RuleBreakdownItem } from '@/services/api';
import ScoreGauge from '@/components/ui/ScoreGauge';
import RuleRow from './RuleRow';
import { Eyebrow } from './Panel';

export default function RuleDrawer({
  open,
  symbol,
  name,
  score,
  rules,
  onClose,
}: {
  open: boolean;
  symbol: string | null;
  name?: string;
  score: number;
  rules: RuleBreakdownItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !symbol) return null;

  const met = rules.filter((r) => r.is_met).length;
  const possible = rules.reduce((sum, r) => sum + (r.score_impact || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${symbol} kural karnesi`}
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-[#12161f] shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div className="flex items-center gap-4">
            <ScoreGauge score={score} size="md" />
            <div>
              <Eyebrow className="text-slate-500">Kural karnesi</Eyebrow>
              <p className="mt-1 font-data text-xl font-bold text-white">{symbol}</p>
              {name && <p className="text-xs text-slate-500">{name}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800 text-center">
          {[
            { label: 'Skor', value: score.toFixed(2) },
            { label: 'Sağlanan', value: `${met}/${rules.length}` },
            { label: 'Azami', value: possible.toFixed(1) },
          ].map((s) => (
            <div key={s.label} className="px-3 py-3">
              <p className="text-[11px] text-slate-500">{s.label}</p>
              <p className="mt-0.5 font-data text-sm font-semibold text-slate-100">{s.value}</p>
            </div>
          ))}
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto p-4">
          {rules.length === 0 ? (
            <li className="rounded-lg border border-slate-800 p-6 text-center text-xs text-slate-500">Aktif kural bulunmuyor.</li>
          ) : (
            rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)
          )}
        </ul>

        <p className="border-t border-slate-800 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
          Skor, sağlanan kuralların ağırlıklarının toplamıdır. Yatırım tavsiyesi değildir.
        </p>
      </aside>
    </div>
  );
}

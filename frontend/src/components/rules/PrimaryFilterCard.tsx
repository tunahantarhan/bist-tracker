'use client';

import { Flame, Pencil } from 'lucide-react';
import { Rule } from '@/types';
import { tfLabel } from '@/lib/timeframes';

interface PrimaryFilterCardProps {
  rule: Rule;
  onEdit: (rule: Rule) => void;
  onToggle: (id: number, isActive: boolean) => void;
}

// The core RSI gate: cannot be deleted, only edited or paused
export default function PrimaryFilterCard({ rule, onEdit, onToggle }: PrimaryFilterCardProps) {
  const params = rule.indicator_2_params ?? {};
  const stats = [
    { label: 'Periyot', value: tfLabel(rule.timeframe, 'badge'), tone: 'text-amber-400' },
    { label: 'Trend ucu (maks.)', value: `≤ ${params.max_trend_end ?? 30}`, tone: 'text-amber-300' },
    { label: 'Min. tepe / Bar', value: `${params.min_peak ?? 55} / ${params.lookback ?? 60}`, tone: 'text-slate-200' },
    { label: 'Skor katkısı', value: `+${Number(rule.score_impact).toFixed(2)}`, tone: 'text-emerald-400' },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-500/35 bg-gradient-to-b from-[#181d29] to-[#12161f] p-4 shadow-2xl sm:p-5">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-500/5 blur-2xl" />

      <div className="mb-3.5 flex items-start justify-between gap-3 border-b border-amber-500/20 pb-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-400">
            <Flame className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">Ana Kapı Filtresi</span>
              <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 font-mono text-[9px] font-semibold text-amber-300">
                Çekirdek Kural
              </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
              Bildirim ve tarama için geçilmesi gereken ilk elek
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={rule.is_active}
          onClick={() => onToggle(rule.id, !rule.is_active)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            rule.is_active ? 'bg-amber-500' : 'bg-slate-700'
          }`}
          title={rule.is_active ? 'Ana filtreyi pasife al' : 'Ana filtreyi aktifleştir'}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition ${
              rule.is_active ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className={`break-words text-sm font-semibold leading-snug ${rule.is_active ? 'text-slate-100' : 'text-slate-400 line-through'}`}>
              {rule.name}
            </h4>
            {rule.description && rule.description !== rule.name && (
              <p className="mt-0.5 text-[11px] text-slate-400">{rule.description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 self-start rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/25"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Parametreleri Düzenle</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-[10px] sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col rounded-lg border border-slate-800 bg-[#161b26] p-2">
              <span className="text-slate-500">{s.label}</span>
              <span className={`mt-0.5 font-bold ${s.tone}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

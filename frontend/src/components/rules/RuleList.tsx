'use client';

import { Rule } from '@/types';
import { Trash2 } from 'lucide-react';

interface RuleListProps {
  rules: Rule[];
  onDeleteRule?: (id: number) => void;
}

export default function RuleList({ rules, onDeleteRule }: RuleListProps) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md">
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
          Aktif Algoritmik Kurallar
        </h2>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-mono text-slate-400">
          {rules.length} Kural
        </span>
      </div>

      <div className="divide-y divide-slate-800/60 font-sans text-sm">
        {rules.length === 0 ? (
          <div className="py-12 text-center text-slate-500">Henüz tanımlanmış algoritmik kural bulunmuyor.</div>
        ) : (
          rules.map((rule) => {
            const targetText =
              rule.target_type === 'static'
                ? rule.static_value
                : `${rule.indicator_2} ${rule.indicator_2_params?.length ? `(${rule.indicator_2_params.length})` : ''}`;

            return (
              <div
                key={rule.id}
                className="group flex items-center justify-between px-6 py-4 hover:bg-slate-850/50 transition-all duration-150"
              >
                <div className="flex items-center space-x-4">
                  {/* Active Status Indicator */}
                  <div className="flex items-center justify-center">
                    {rule.is_active ? (
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                      </span>
                    ) : (
                      <span className="relative flex h-3 w-3">
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500/80 shadow-[0_0_8px_#f43f5e]"></span>
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-100">
                        {rule.name}
                      </span>
                      <span className="rounded bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 text-[11px] font-mono font-medium text-blue-400">
                        +{Number(rule.score_impact).toFixed(2)} Puan
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-mono">
                      {rule.indicator_1} {rule.indicator_1_params?.length ? `(${rule.indicator_1_params.length})` : ''}{' '}
                      <span className="text-amber-400">{rule.condition}</span>{' '}
                      {targetText}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-md border ${
                      rule.is_active
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-700 bg-slate-800/50 text-slate-400'
                    }`}
                  >
                    {rule.is_active ? 'Aktif' : 'Pasif'}
                  </span>

                  {onDeleteRule && (
                    <button
                      onClick={() => onDeleteRule(rule.id)}
                      className="p-1.5 rounded-md text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Kuralı Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
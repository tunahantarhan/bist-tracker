'use client';

import { Rule } from '@/types';
import { Trash2, Filter, Clock } from 'lucide-react';

interface RuleListProps {
  rules: Rule[];
  onDeleteRule?: (id: number) => void;
}

const TIMEFRAME_BADGE: Record<string, string> = {
  '5m': '5 DK',
  '15m': '15 DK',
  '1h': '1 SAAT',
  '4h': '4 SAAT',
  '1d': '1 GÜN',
};

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
          <div className="py-12 text-center text-slate-500">
            Henüz tanımlanmış algoritmik kural bulunmuyor.
          </div>
        ) : (
          rules.map((rule) => {
            const tfLabel = TIMEFRAME_BADGE[rule.timeframe || '1d'] || (rule.timeframe || '1D').toUpperCase();
            const targetText =
              rule.target_type === 'static'
                ? rule.static_value
                : rule.indicator_2 === 'RSI_TRENDLINE'
                ? 'RSI Düşen Trend (Mavi Çizgi)'
                : `${rule.indicator_2} ${rule.indicator_2_params?.length ? `(${rule.indicator_2_params.length})` : ''}`;

            return (
              <div
                key={rule.id}
                className="group flex items-center justify-between px-5 py-4 hover:bg-slate-850/50 transition-all duration-150"
              >
                <div className="flex items-start space-x-3.5">
                  {/* Active Status Indicator */}
                  <div className="mt-1.5 flex items-center justify-center">
                    {rule.is_active ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                      </span>
                    ) : (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500/80"></span>
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-100">
                        {rule.name}
                      </span>

                      {/* Timeframe Badge */}
                      <span className="inline-flex items-center space-x-1 rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-purple-300">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        <span>{tfLabel}</span>
                      </span>

                      {/* Primary Filter (Funnel Gatekeeper) Badge */}
                      {rule.is_primary_filter && (
                        <span className="inline-flex items-center space-x-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-amber-300">
                          <Filter className="h-2.5 w-2.5 mr-0.5" />
                          <span>ANA FİLTRE</span>
                        </span>
                      )}

                      {/* Score Impact Badge */}
                      <span className="rounded bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[10px] font-mono font-semibold text-blue-400">
                        +{Number(rule.score_impact).toFixed(2)} Puan
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1.5 font-mono">
                      {rule.indicator_1} {rule.indicator_1_params?.length ? `(${rule.indicator_1_params.length})` : ''}{' '}
                      <span className="text-amber-400 font-semibold">{rule.condition}</span>{' '}
                      <span className="text-slate-200">{targetText}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
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
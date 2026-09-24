'use client';

import { Rule } from '@/types';

interface RuleListProps {
  rules: Rule[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export default function RuleList({ rules, selectedSymbol, onSelectSymbol }: RuleListProps) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md">
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
          Kural Motoru & Aktif Taramalar
        </h2>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-mono text-slate-400">
          {rules.length} Kural
        </span>
      </div>

      <div className="divide-y divide-slate-800/60 font-sans text-sm">
        {rules.length === 0 ? (
          <div className="py-12 text-center text-slate-500">Kayıtlı kural bulunamadı.</div>
        ) : (
          rules.map((rule) => {
            const isSelected = selectedSymbol.toUpperCase() === rule.symbol.toUpperCase();
            return (
              <div
                key={rule.id}
                onClick={() => onSelectSymbol(rule.symbol)}
                className={`group flex items-center justify-between px-6 py-4 transition-all duration-150 cursor-pointer ${
                  isSelected ? 'bg-slate-800/40' : 'hover:bg-slate-850/50'
                }`}
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
                      <span className="font-mono font-bold text-slate-100 group-hover:text-blue-400 transition-colors">
                        {rule.symbol}
                      </span>
                      <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400">
                        {rule.rule_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Koşul: <span className="font-mono text-slate-300">{rule.operator} {rule.threshold}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded-md border ${
                    rule.is_active 
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' 
                      : 'border-slate-700 bg-slate-800/50 text-slate-400'
                  }`}>
                    {rule.is_active ? 'Çalışıyor' : 'Durduruldu'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
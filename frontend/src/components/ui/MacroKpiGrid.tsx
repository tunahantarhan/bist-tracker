'use client';

import { useState, useEffect } from 'react';
import { fetchMacroData, MacroItem } from '@/services/api';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function MacroKpiGrid() {
  const [macroItems, setMacroItems] = useState<MacroItem[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await fetchMacroData();
      if (data && data.length > 0) setMacroItems(data);
    };
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, []);

  if (macroItems.length === 0) return null;

  const formatPrice = (val: number) => {
    if (val >= 1000) {
      return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toFixed(2);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4 select-none">
      {macroItems.map((item) => {
        const isUp = item.change_pct >= 0;
        return (
          <div
            key={item.symbol}
            className="flex flex-col justify-between p-3.5 rounded-xl border border-slate-800/80 bg-[#10141e]/80 backdrop-blur-sm hover:border-slate-700/80 transition-all duration-200 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>{item.label}</span>
              <span
                className={`inline-flex items-center text-[11px] font-mono font-bold ${
                  isUp ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isUp ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                {isUp ? '+' : ''}{item.change_pct.toFixed(2)}%
              </span>
            </div>

            <div className="mt-2 text-lg lg:text-xl font-bold font-mono text-slate-100 tracking-tight">
              {item.prefix}{formatPrice(item.current_price)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
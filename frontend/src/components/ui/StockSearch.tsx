'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Check } from 'lucide-react';
import { fetchUniverse } from '@/services/api';

interface Stock {
  symbol: string;
  name: string;
}

interface StockSearchProps {
  userWatchlist: string[]; 
  onToggleWatchlist: (symbol: string, isAdded: boolean) => void;
}

export default function StockSearch({ userWatchlist, onToggleWatchlist }: StockSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetching stock universe from backend
    fetchUniverse().then(setAvailableStocks).catch(console.error);

    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStocks = availableStocks.filter(stock =>
    stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
    stock.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={wrapperRef} className="relative hidden md:block z-50">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Hisse Ara (Örn: THYAO)..."
        className="h-9 w-72 rounded-md border border-slate-700 bg-slate-900/50 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-text"
      />

      <div
        className={`absolute top-full left-0 mt-2 w-full rounded-xl border border-slate-800 bg-[#12161f] shadow-2xl overflow-hidden transition-all duration-300 origin-top ${
          isOpen && query.length > 0
            ? 'opacity-100 scale-y-100'
            : 'opacity-0 scale-y-0 pointer-events-none'
        }`}
      >
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 p-1 custom-scrollbar">
          {filteredStocks.length > 0 ? (
            filteredStocks.map((stock) => {
              const isAdded = userWatchlist.includes(stock.symbol);
              return (
                <div key={stock.symbol} className="flex items-center justify-between p-2 hover:bg-slate-800/50 rounded-lg transition-colors group cursor-pointer" onClick={() => onToggleWatchlist(stock.symbol, isAdded)}>
                  <div className="flex flex-col pointer-events-none">
                    <span className="font-mono font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">{stock.symbol}</span>
                    <span className="text-[10px] text-slate-500">{stock.name}</span>
                  </div>
                  <button
                    className={`h-7 w-7 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer shadow-sm ${
                      isAdded
                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 hover:scale-105'
                        : 'bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white hover:scale-105'
                    }`}
                  >
                    {isAdded ? (
                      <Check className="h-4 w-4 scale-100 transition-transform" />
                    ) : (
                      <Plus className="h-4 w-4 scale-100 group-hover:rotate-90 transition-transform duration-300" />
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">Hisse bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  );
}
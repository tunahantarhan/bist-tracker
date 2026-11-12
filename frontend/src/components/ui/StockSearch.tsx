'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Check, Eye } from 'lucide-react';
import { fetchUniverse } from '@/services/api';

interface Stock {
  symbol: string;
  name: string;
}

interface StockSearchProps {
  userWatchlist: string[];
  onToggleWatchlist: (symbol: string, isAdded: boolean) => Promise<void> | void;
  /** Row click opens the stock; without it the row toggles the watchlist. */
  onSelect?: (symbol: string) => void;
  /** Focus the input with the "/" key */
  enableShortcut?: boolean;
}

const normalize = (value: string) => value.toLocaleLowerCase('tr-TR');

export default function StockSearch({ userWatchlist, onToggleWatchlist, onSelect, enableShortcut = false }: StockSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUniverse().then(setAvailableStocks).catch(console.error);

    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!enableShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enableShortcut]);

  const q = normalize(query.trim());
  const filteredStocks = q
    ? availableStocks.filter((stock) => normalize(stock.symbol).includes(q) || normalize(stock.name).includes(q))
    : [];

  const choose = (stock: Stock) => {
    if (onSelect) {
      onSelect(stock.symbol);
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
    } else {
      onToggleWatchlist(stock.symbol, userWatchlist.includes(stock.symbol));
    }
  };

  return (
    <div ref={wrapperRef} className="relative z-50 w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
          } else if (e.key === 'Enter' && filteredStocks[0]) {
            e.preventDefault();
            choose(filteredStocks[0]);
          }
        }}
        placeholder="Hisse ara… (ör. THYAO)"
        aria-label="Hisse ara"
        className="h-10 w-full cursor-text rounded-lg border border-slate-800 bg-slate-900/60 pl-9 pr-10 text-sm text-slate-200 placeholder:text-slate-500 transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {enableShortcut && !query && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-700 bg-slate-800/80 px-1.5 font-data text-[10px] text-slate-400 sm:block">
          /
        </kbd>
      )}

      <div
        className={`absolute left-0 top-full mt-2 w-full min-w-[18rem] origin-top overflow-hidden rounded-xl border border-slate-800 bg-[#12161f] shadow-2xl transition-all duration-200 ${
          isOpen && query.length > 0 ? 'scale-y-100 opacity-100' : 'pointer-events-none scale-y-95 opacity-0'
        }`}
      >
        <div className="custom-scrollbar max-h-72 divide-y divide-slate-800/60 overflow-y-auto p-1">
          {filteredStocks.length > 0 ? (
            filteredStocks.map((stock, i) => {
              const isAdded = userWatchlist.includes(stock.symbol);
              return (
                <div
                  key={stock.symbol}
                  className={`group flex cursor-pointer items-center justify-between rounded-lg p-2 transition-colors hover:bg-slate-800/50 ${
                    i === 0 ? 'bg-slate-800/30' : ''
                  }`}
                  onClick={() => choose(stock)}
                >
                  <div className="flex min-w-0 flex-col pr-2">
                    <span className="font-data text-sm font-semibold text-slate-200 transition-colors group-hover:text-blue-400">
                      {stock.symbol}
                    </span>
                    <span className="max-w-[180px] truncate text-[11px] text-slate-500">{stock.name}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={`/detay/${stock.symbol}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`${stock.symbol} detay sayfası (yeni sekme)`}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-slate-800 text-slate-400 shadow-sm transition-all hover:bg-slate-700 hover:text-blue-400"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWatchlist(stock.symbol, isAdded);
                      }}
                      title={isAdded ? 'Takip listesinden çıkar' : 'Takip listesine ekle'}
                      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-sm transition-all duration-300 ${
                        isAdded
                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white'
                      }`}
                    >
                      {isAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />}
                    </button>
                  </div>
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

'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TickerItem {
  symbol: string;
  current_price: number;
  change_pct: number;
}

interface StockTickerProps {
  items?: { symbol: string; current_price: number; change_pct: number }[];
}

const TickerCell = ({ item }: { item: TickerItem }) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPrice = useRef(item.current_price);

  useEffect(() => {
    if (item.current_price !== prevPrice.current) {
      setFlash(item.current_price > prevPrice.current ? 'up' : 'down');
      prevPrice.current = item.current_price;
      
      const timer = setTimeout(() => setFlash(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [item.current_price]);

  return (
    <a 
      href={`/detay/${item.symbol}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`${item.symbol} detayını yeni sekmede görüntüle`}
      className={`flex items-center space-x-2 px-6 py-2 border-r border-slate-800/50 cursor-pointer transition-colors duration-500 group select-none shrink-0
        ${flash === 'up' ? 'bg-emerald-500/20' : flash === 'down' ? 'bg-rose-500/20' : 'hover:bg-slate-800/40'}
      `}
    >
      <span className="text-xs font-bold text-slate-300 group-hover:text-blue-400 transition-colors">
        {item.symbol}
      </span>
      <span className={`text-xs font-mono transition-colors duration-300 ${flash === 'up' ? 'text-emerald-400' : flash === 'down' ? 'text-rose-400' : 'text-slate-100'}`}>
        ₺{item.current_price.toFixed(2)}
      </span>
      <span className={`flex items-center text-[10px] font-mono font-semibold ${item.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {item.change_pct >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
        {item.change_pct >= 0 ? '+' : ''}{item.change_pct}%
      </span>
    </a>
  );
};

export default function StockTicker({ items }: StockTickerProps) {
  const [internalTickerData, setInternalTickerData] = useState<TickerItem[]>([]);

  // Fetch ticker items only if not provided from parent dashboard props
  useEffect(() => {
    if (items && items.length > 0) return;

    const fetchTickerData = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/v1/market/ticker', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setInternalTickerData(data);
        }
      } catch (error) {
        console.warn('Ticker data fetch warning:', error);
      }
    };

    fetchTickerData();
    const intervalId = setInterval(fetchTickerData, 15000);
    return () => clearInterval(intervalId);
  }, [items]);

  const activeItems = (items && items.length > 0) ? items : internalTickerData;

  if (activeItems.length === 0) return null;
  const animationDuration = Math.max(activeItems.length * 3.5, 20);

  return (
    <div className="w-full bg-[#0b0e14] border-b border-slate-800/80 overflow-hidden relative z-30 flex">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes custom-scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .custom-ticker-track {
          display: flex;
          align-items: center;
          width: max-content;
          animation: custom-scroll-left ${animationDuration}s linear infinite;
        }
        .custom-ticker-track:hover {
          animation-play-state: paused;
        }
      `}} />
      
      <div className="custom-ticker-track">
        {activeItems.concat(activeItems).map((stock, idx) => (
          <TickerCell key={`${stock.symbol}-${idx}`} item={stock} />
        ))}
      </div>
    </div>
  );
}
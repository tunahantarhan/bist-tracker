'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TickerItem {
  symbol: string;
  current_price: number;
  change_pct: number;
}

const TickerCell = ({ item }: { item: TickerItem }) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [displayPrice, setDisplayPrice] = useState(item.current_price);
  const [displayChange, setDisplayChange] = useState(item.change_pct);
  const prevPrice = useRef(item.current_price);

  useEffect(() => {
    if (item.current_price > prevPrice.current) {
      // 1. Lit background green for price increase
      setFlash('up');
      
      // 2. Update the number after half a second (500ms)
      const updateTimer = setTimeout(() => {
        setDisplayPrice(item.current_price);
        setDisplayChange(item.change_pct);
      }, 1000);

      // 3. Remove the background color after one second
      const flashTimer = setTimeout(() => setFlash(null), 2000);
      
      prevPrice.current = item.current_price;
      return () => { clearTimeout(updateTimer); clearTimeout(flashTimer); };
      
    } else if (item.current_price < prevPrice.current) {
      // 1. Lit background red for price decrease
      setFlash('down');
      
      // 2. Update the number after half a second (500ms)
      const updateTimer = setTimeout(() => {
        setDisplayPrice(item.current_price);
        setDisplayChange(item.change_pct);
      }, 1000);

      // 3. Remove the background color after one second
      const flashTimer = setTimeout(() => setFlash(null), 2000);
      
      prevPrice.current = item.current_price;
      return () => { clearTimeout(updateTimer); clearTimeout(flashTimer); };
    }
  }, [item.current_price, item.change_pct]);

  return (
    <div 
      className={`flex items-center space-x-2 px-6 border-r border-slate-800/50 h-10 transition-colors duration-500
        ${flash === 'up' ? 'bg-emerald-500/20' : flash === 'down' ? 'bg-rose-500/20' : 'hover:bg-slate-800/30'}
      `}
    >
      <span className="text-sm font-semibold text-slate-300">{item.symbol}</span>
      <span className={`text-sm font-mono transition-colors duration-300 ${flash === 'up' ? 'text-emerald-400' : flash === 'down' ? 'text-rose-400' : 'text-slate-100'}`}>
        ₺{displayPrice.toFixed(2)}
      </span>
      <span className={`flex items-center text-xs font-medium ${displayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {displayChange >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
        %{Math.abs(displayChange).toFixed(2)}
      </span>
    </div>
  );
};

export default function StockTicker() {
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTickerData = async (isInitial = false) => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/v1/market/ticker');
        if (res.ok) {
          const newData: TickerItem[] = await res.json();
          
          if (isInitial) {
            setTickerItems(newData);
            setLoading(false);
          } else {
            newData.forEach((newItem) => {
              const randomDelay = Math.random() * 1000; // Gecikmeyi maksimum 1 saniyeye düşürdük
              setTimeout(() => {
                setTickerItems((prev) => {
                  const exists = prev.find(p => p.symbol === newItem.symbol);
                  if (!exists) return [...prev, newItem];
                  return prev.map(p => p.symbol === newItem.symbol ? newItem : p);
                });
              }, randomDelay);
            });
          }
        }
      } catch (error) {
        console.error('Ticker verisi çekilemedi:', error);
        setLoading(false);
      }
    };

    fetchTickerData(true);

    const intervalId = setInterval(() => fetchTickerData(false), 15000);

    return () => clearInterval(intervalId);
  }, []);

  const displayItems = tickerItems.length > 0 
    ? [...tickerItems, ...tickerItems, ...tickerItems] 
    : [];

  if (loading && tickerItems.length === 0) return null;
  if (tickerItems.length === 0) return null;

  return (
    <div className="w-full bg-[#080a0f] border-b border-slate-800/80 flex items-center h-10 overflow-hidden relative select-none">
      <div className="absolute left-0 top-0 w-16 h-full bg-gradient-to-r from-[#080a0f] to-transparent z-10 pointer-events-none"></div>
      <div className="absolute right-0 top-0 w-16 h-full bg-gradient-to-l from-[#080a0f] to-transparent z-10 pointer-events-none"></div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .animate-ticker {
          display: flex;
          width: max-content;
          animation: ticker 120s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}} />

      <div className="animate-ticker cursor-default">
        {displayItems.map((item, idx) => (
          <TickerCell key={`${item.symbol}-${idx}`} item={item} />
        ))}
      </div>
    </div>
  );
}
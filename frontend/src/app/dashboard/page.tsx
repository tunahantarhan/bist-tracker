'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NotificationBell from '@/components/notifications/NotificationBell';
import StockSearch from '@/components/ui/StockSearch';
import {
  API_URL,
  fetchMarketData,
  MarketData,
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  fetchMarketOverview,
  MarketOverviewResponse,
  StockOverviewItem,
} from '@/services/api';
import {
  User, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, XCircle,
  Activity, Trash2, LogOut, ShieldCheck, Filter, Calendar, Clock,
  SlidersHorizontal, Flame, Trophy, Gem, X, ChevronDown, ChevronUp,
  Search, Plus, ExternalLink, Sparkles, SquareText
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import StockTicker from '@/components/ui/StockTicker';

interface TickerItem {
  symbol: string;
  current_price: number;
  change_pct: number;
}

const TICKER_NAMES: Record<string, string> = {
  "THYAO": "Türk Hava Yolları A.O.",
  "KCHOL": "Koç Holding A.Ş.",
  "GARAN": "Garanti BBVA"
};

const CHART_INTERVALS = [
  { value: '5m', label: '5Dk' }, { value: '15m', label: '15Dk' },
  { value: '1h', label: '1S' }, { value: '4h', label: '4S' }, { value: '1d', label: '1G' },
];

const CHART_PERIODS = [
  { value: '1mo', label: '1A' }, { value: '3mo', label: '3A' },
  { value: '6mo', label: '6A' }, { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' }, { value: '5y', label: '5Y' },
];

interface TopPricedRowProps {
  item: TickerItem;
  rank: number;
  name: string;
  isSelected: boolean;
  onSelect: () => void;
}

const TopPricedRow = ({ item, rank, name, isSelected, onSelect }: TopPricedRowProps) => {
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
    <div
      onClick={onSelect}
      className={`flex items-center justify-between px-5 py-3 cursor-pointer transition-colors duration-150 ${
        isSelected ? 'bg-slate-800/50 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-slate-800/30'
      }`}
    >
      <div className="flex items-center space-x-3 min-w-0">
        <span className={`w-5 text-xs font-mono font-bold ${rank < 3 ? 'text-blue-400' : 'text-slate-500'}`}>#{rank + 1}</span>
        <div className="flex flex-col">
          <span className="text-xs font-mono font-bold text-slate-100">{item.symbol}</span>
          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{name}</span>
        </div>
      </div>
      
      <div className={`flex items-center justify-end space-x-1 px-2.5 py-1 rounded font-mono text-xs font-bold border transition-all duration-500 min-w-[75px] ${
          flash === 'up' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
            : flash === 'down' ? 'bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.2)]'
            : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
        }`}>
        {flash === 'up' && <TrendingUp className="h-3 w-3" />}
        {flash === 'down' && <TrendingDown className="h-3 w-3" />}
        <span>₺{item.current_price.toFixed(2)}</span>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const selectedSymbolRef = useRef<string | null>(null);

  // Dedicated DOM reference to scroll directly to the chart container
  const chartSectionRef = useRef<HTMLDivElement>(null);

  const chartCacheRef = useRef<Record<string, { candles: any[]; indicators?: any[]; rsi_pane?: any }>>({});

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);
  
  const [dynamicNames, setDynamicNames] = useState<Record<string, string>>(TICKER_NAMES);

  const [isWatchlistOpen, setIsWatchlistOpen] = useState<boolean>(true);
  const [isFunnelOpen, setIsFunnelOpen] = useState<boolean>(true);

  // State and reference for the custom non-shifting profile dropdown menu
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Expandable states for Top 10 lists
  const [isTopScoredExpanded, setIsTopScoredExpanded] = useState<boolean>(false);
  const [isTopPricedExpanded, setIsTopPricedExpanded] = useState<boolean>(false);
  
  // State and reference for the RSI Filter explanation card
  const [isRsiInfoOpen, setIsRsiInfoOpen] = useState<boolean>(false);
  const rsiInfoRef = useRef<HTMLDivElement>(null);
  const rsiButtonRef = useRef<HTMLButtonElement>(null);

  const [isRuleDrawerOpen, setIsRuleDrawerOpen] = useState<boolean>(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);

  const [chartConfig, setChartConfig] = useState<{ interval: string; period: string }>({
    interval: '4h', period: '6mo',
  });

  const [marketData, setMarketData] = useState<MarketData | null>(null);
  
  // Independent chart data state to avoid resetting zoom level during background refreshes
  const [chartData, setChartData] = useState<{
    candles: any[];
    indicators?: any[];
    rsi_pane?: any;
  } | null>(null);
  const [loadingMarket, setLoadingMarket] = useState<boolean>(false);

  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [stockScores, setStockScores] = useState<Record<string, number>>({});
  
  const [liveTickerData, setLiveTickerData] = useState<TickerItem[]>([]);

  const prevScoreRef = useRef<number | null>(null);
  const prevScoreSymbolRef = useRef<string | null>(null);
  const [scoreFlash, setScoreFlash] = useState<'up' | 'down' | null>(null);

  const prevPriceRef = useRef<number | null>(null);
  const prevPriceSymbolRef = useRef<string | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  const [bistTime, setBistTime] = useState<string>('--:--:--');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rsiInfoRef.current && 
        !rsiInfoRef.current.contains(target) &&
        rsiButtonRef.current && 
        !rsiButtonRef.current.contains(target)
      ) {
        setIsRsiInfoOpen(false);
      }
    };
    if (isRsiInfoOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRsiInfoOpen]);

  // Select stock and smoothly scroll to chart section across both desktop and mobile
  const handleSelectStockWithScroll = (symbol: string) => {
    setSelectedSymbol(symbol);
    if (chartSectionRef.current) {
      chartSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Refreshes left menu RSI and ranking overview without modifying the selected stock
  const refreshOverview = useCallback(async () => {
    try {
      const ov = await fetchMarketOverview();
      setOverview(ov);
      const scoresMap: Record<string, number> = {};
      const namesMap: Record<string, string> = { ...TICKER_NAMES };
      
      ov.items.forEach((item) => {
        scoresMap[item.symbol] = item.score;
        namesMap[item.symbol] = item.name; 
      });
      
      setStockScores(scoresMap);
      setDynamicNames(namesMap);
    } catch (err) {
      console.warn('Overview refresh warning:', err);
    }
  }, []);

  // Fetches market data for the target stock with instant client cache fallback
  const loadMarket = useCallback(async (symbol: string, interval: string, period: string, isBackground = false, signal?: AbortSignal) => {
    const cacheKey = `${symbol}_${interval}_${period}`;
    const cachedData = chartCacheRef.current[cacheKey];

    // 1. If cached data exists and it's not a background refresh, render immediately (0ms)
    if (cachedData && !isBackground) {
      setChartData(cachedData);
      setLoadingMarket(false);
    } else if (!isBackground) {
      setLoadingMarket(true);
    }

    try {
      const data = await fetchMarketData(symbol, interval, period, signal);
      setMarketData(data);

      const newChartPayload = {
        candles: data.candles,
        indicators: data.indicators || [],
        rsi_pane: data.rsi_pane,
      };

      // 2. Save fresh data to client cache
      chartCacheRef.current[cacheKey] = newChartPayload;

      // 3. Update chart state if it was a user click or if cache was empty
      if (!isBackground || !cachedData) {
        setChartData(newChartPayload);
      }
      
      if (data.score !== undefined) {
        setStockScores((prev) => ({ ...prev, [symbol]: data.score! }));
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.warn('Market data fetch warning:', err?.message);
    } finally {
      if (!isBackground) setLoadingMarket(false);
    }
  }, []);

  // Initial dashboard setup (runs only on initial page load)
  const initializeDashboard = useCallback(async () => {
    // 1. Fetch Watchlist independently (renders in ~10ms)
    fetchWatchlist()
      .then((data) => {
        const symbols = data.map((item: any) => item.symbol);
        setWatchlist(symbols);
        if (symbols.length > 0) {
          setSelectedSymbol((curr) => curr || symbols[0]);
        }
      })
      .catch((err) => console.warn('Watchlist init warning:', err));

    // 2. Fetch Ticker immediately on initial load (0s delay)
    fetch(`${API_URL}/market/ticker`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLiveTickerData(data))
      .catch((err) => console.warn('Ticker init warning:', err));

    // 3. Fetch Overview (RSI and Top Scored lists)
    try {
      const ov = await fetchMarketOverview();
      setOverview(ov);
      const scoresMap: Record<string, number> = {};
      const namesMap: Record<string, string> = { ...TICKER_NAMES };

      ov.items.forEach((item) => {
        scoresMap[item.symbol] = item.score;
        namesMap[item.symbol] = item.name;
      });

      setStockScores(scoresMap);
      setDynamicNames(namesMap);

      if (ov.top_scored.length > 0) {
        setSelectedSymbol((curr) => curr || ov.top_scored[0].symbol);
      }
    } catch (err) {
      console.warn('Overview init warning:', err);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  // Real-time synchronization with admin panel rules via BroadcastChannel
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('bist_tracker_sync');
      bc.onmessage = (event) => {
        if (event.data === 'RULES_UPDATED') {
          setTimeout(() => {
            refreshOverview();
            if (selectedSymbolRef.current) {
              setChartConfig((prev) => ({ ...prev }));
            }
          }, 500);
        }
      };
      return () => bc.close();
    } catch (e) {
      console.warn("BroadcastChannel unsupported");
    }
  }, [refreshOverview]);

  // Initial authentication verification and dashboard boot
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/auth');
      return;
    }
    setIsAuthenticated(true);
    setIsAdmin(localStorage.getItem('is_admin') === 'true');
    initializeDashboard();
  }, [router, initializeDashboard]);

  // Delay chart resize calculation on layout toggle
  useEffect(() => {
    const timer = setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 60);
    return () => clearTimeout(timer);
  }, [isWatchlistOpen, isFunnelOpen]);

  // Delayed BIST clock calculation and market hours freeze
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const utcMs = now.getTime();
      const istOffsetMs = 3 * 60 * 60 * 1000;
      const delayMs = 15 * 60 * 1000;
      
      const delayedIst = new Date(utcMs + istOffsetMs - delayMs);
      
      const hours = delayedIst.getUTCHours();
      const minutes = delayedIst.getUTCMinutes();
      const seconds = delayedIst.getUTCSeconds();
      const day = delayedIst.getUTCDay(); 
      
      let displayHours = hours;
      let displayMinutes = minutes;
      let displaySeconds = seconds;

      const timeInSeconds = hours * 3600 + minutes * 60 + seconds;
      const openTime = 10 * 3600; 
      const closeTime = 18 * 3600 + 10 * 60; 

      if (day === 0 || day === 6 || timeInSeconds < openTime || timeInSeconds >= closeTime) {
        displayHours = 18; displayMinutes = 10; displaySeconds = 0;
      }
      
      const hh = String(displayHours).padStart(2, '0');
      const mm = String(displayMinutes).padStart(2, '0');
      const ss = String(displaySeconds).padStart(2, '0');
      setBistTime(`${hh}:${mm}:${ss}`);
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Triggered when stock or interval period is changed by user
  useEffect(() => {
    if (!selectedSymbol || !isAuthenticated) return;
    const controller = new AbortController();
    loadMarket(selectedSymbol, chartConfig.interval, chartConfig.period, false, controller.signal);
    return () => controller.abort();
  }, [selectedSymbol, chartConfig, isAuthenticated, loadMarket]);

  // Unified Heartbeat: Consolidates all background requests into a single synchronized 15s cycle
  useEffect(() => {
    if (!isAuthenticated) return;

    const runHeartbeat = async () => {
      const currentSym = selectedSymbolRef.current;
      await Promise.allSettled([
        fetch(`${API_URL}/market/ticker`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => setLiveTickerData(data)),

        refreshOverview(),

        currentSym ? loadMarket(currentSym, chartConfig.interval, chartConfig.period, true) : Promise.resolve(),
      ]);
      setLoadingOverview(false);
    };

    // Run once on mount, then continue every 15s
    runHeartbeat();
    const heartbeatTimer = setInterval(runHeartbeat, 15000);
    return () => clearInterval(heartbeatTimer);
  }, [isAuthenticated, chartConfig, loadMarket, refreshOverview]);

  const handleToggleWatchlist = async (symbol: string, isAdded: boolean) => {
    try {
      if (isAdded) {
        await removeFromWatchlist(symbol);
        setWatchlist((prev) => prev.filter((s) => s !== symbol));
      } else {
        await addToWatchlist(symbol);
        setWatchlist((prev) => [...prev, symbol]);
        handleSelectStockWithScroll(symbol);
        setIsMobileSearchOpen(false);
      }
    } catch (err: any) { alert(err.message); }
  };

  const handleIntervalChange = (newInterval: string) => {
    setChartConfig((prev) => {
      let nextPeriod = prev.period;
      if (newInterval === '5m' || newInterval === '15m') nextPeriod = '1mo';
      else if ((newInterval === '1h' || newInterval === '4h') && prev.period === '5y') nextPeriod = '1y';
      return { interval: newInterval, period: nextPeriod };
    });
  };

  const handlePeriodChange = (newPeriod: string) => {
    setChartConfig((prev) => {
      let nextInterval = prev.interval;
      if (newPeriod === '5y' && prev.interval !== '1d') nextInterval = '1d';
      else if (newPeriod !== '1mo' && (prev.interval === '5m' || prev.interval === '15m')) nextInterval = '4h';
      return { interval: nextInterval, period: newPeriod };
    });
  };

  const currentScore = marketData?.score ?? (selectedSymbol ? stockScores[selectedSymbol] ?? 0 : 0);

  // Score flash animation
  useEffect(() => {
    if (!selectedSymbol) return;

    if (prevScoreSymbolRef.current !== selectedSymbol) {
      prevScoreSymbolRef.current = selectedSymbol;
      prevScoreRef.current = currentScore;
      setScoreFlash(null);
      return;
    }

    if (prevScoreRef.current !== null && currentScore !== prevScoreRef.current) {
      setScoreFlash(currentScore > prevScoreRef.current ? 'up' : 'down');
      const timer = setTimeout(() => setScoreFlash(null), 1000);
      prevScoreRef.current = currentScore;
      return () => clearTimeout(timer);
    }
    prevScoreRef.current = currentScore;
  }, [selectedSymbol, currentScore]);

  // Price flash animation
  useEffect(() => {
    if (!marketData || marketData.current_price === undefined) return;

    const currentSymbol = marketData.symbol;
    const currentPrice = marketData.current_price;

    if (prevPriceSymbolRef.current !== currentSymbol) {
      prevPriceSymbolRef.current = currentSymbol;
      prevPriceRef.current = currentPrice;
      setPriceFlash(null);
      return;
    }

    if (prevPriceRef.current !== null && currentPrice !== prevPriceRef.current) {
      setPriceFlash(currentPrice > prevPriceRef.current ? 'up' : 'down');
      const timer = setTimeout(() => setPriceFlash(null), 1000);
      prevPriceRef.current = currentPrice;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
  }, [marketData?.symbol, marketData?.current_price]);

  if (!isAuthenticated) return <div className="min-h-screen bg-[#0b0e14]" />;

  const rulesList = marketData?.rules_breakdown || [];
  const rsiPassedList: StockOverviewItem[] = overview?.rsi_passed || [];
  const topScoredList: StockOverviewItem[] = overview?.top_scored || [];
  
  const dynamicTopPriced = [...liveTickerData]
    .sort((a, b) => b.current_price - a.current_price)
    .slice(0, 10);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-200 overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b0e14]/95 backdrop-blur-md px-4 sm:px-6 min-h-[68px] flex items-center">
        {isMobileSearchOpen ? (
          <div className="flex items-center w-full gap-3 animate-in fade-in duration-200">
             <div className="flex-1 w-full">
               <StockSearch userWatchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
             </div>
             <button 
               onClick={() => setIsMobileSearchOpen(false)} 
               className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 transition-colors shrink-0"
             >
               <X className="h-5 w-5 text-slate-300" />
             </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-4 sm:space-x-6">
              <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => router.push('/')}>
                <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#2563eb]">
                  <span className="font-mono text-sm font-black text-white">B</span>
                </div>
                <span className="hidden sm:inline font-semibold text-slate-100 tracking-tight">BIST Tracker</span>
              </div>
              <div className="hidden sm:block w-64">
                 <StockSearch userWatchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3">
              <button 
                onClick={() => setIsMobileSearchOpen(true)} 
                className="sm:hidden p-2 rounded-full border border-slate-700 bg-slate-800/50 hover:bg-slate-700 transition-colors"
              >
                <Search className="h-4 w-4 text-slate-300" />
              </button>

              <NotificationBell />

              {/* Profile Dropdown Menu */}
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                  className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-all outline-none cursor-pointer"
                  title="Hesabım"
                >
                  <User className="h-4 w-4 text-slate-300" />
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-[#12161f] text-slate-200 p-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="text-xs text-slate-400 px-2 py-1.5 font-medium">Hesabım</div>
                    <div className="h-px bg-slate-800/80 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        const slug = localStorage.getItem('user_slug') || 'demo';
                        router.push(`/kullanici/${slug}`);
                      }}
                      className="w-full flex items-center py-2 px-2.5 rounded-md hover:bg-slate-800/80 text-xs text-left cursor-pointer transition-colors"
                    >
                      <User className="mr-2 h-4 w-4 text-slate-400" />
                      <span>Profil</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          window.location.href = '/admin';
                        }}
                        className="w-full flex items-center py-2 px-2.5 rounded-md hover:bg-slate-800/80 text-xs text-left text-emerald-400 cursor-pointer transition-colors"
                      >
                        <ShieldCheck className="mr-2 h-4 w-4 text-emerald-500" />
                        <span>Admin Paneli</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        localStorage.removeItem('access_token');
                        localStorage.removeItem('is_admin');
                        router.push('/auth');
                      }}
                      className="w-full flex items-center py-2 px-2.5 rounded-md bg-rose-950/30 text-rose-400 border border-rose-500/10 hover:!bg-rose-900/45 text-xs text-left cursor-pointer transition-colors mt-1"
                    >
                      <LogOut className="mr-2 h-4 w-4 text-rose-400" />
                      <span>Çıkış Yap</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Sliding Ticker Band */}
      <StockTicker items={liveTickerData} />

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          <aside className="w-full lg:w-72 shrink-0 space-y-4">
            
            {/* Watchlist Card with Smooth Collapsible Accordion */}
            <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-xl backdrop-blur-md overflow-hidden flex flex-col">
              <div 
                onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                className="px-4 py-3.5 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors group select-none"
              >
                <div className="flex items-center space-x-2">
                  <SquareText className={`h-4 w-4 transition-colors ${isWatchlistOpen ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
                  <h2 className={`text-[11px] font-semibold tracking-wider uppercase transition-colors ${isWatchlistOpen ? 'text-slate-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
                    Takip Listesi
                  </h2>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded-md">{watchlist.length}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-300 ${!isWatchlistOpen ? '-rotate-90' : ''}`} />
                </div>
              </div>

              <div className={`grid transition-all duration-300 ease-in-out ${
                isWatchlistOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
              }`}>
                <div className="overflow-hidden">
                  <div className="divide-y divide-slate-800/60 max-h-[250px] lg:max-h-[300px] overflow-y-auto scrollbar-hide">
                    {watchlist.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">Listeniz boş. Arama çubuğundan hisse ekleyin.</div>
                    ) : (
                      watchlist.map((symbol) => {
                        const isSelected = selectedSymbol === symbol;
                        const symScore = stockScores[symbol];
                        return (
                          <div 
                            key={symbol} 
                            onClick={() => handleSelectStockWithScroll(symbol)} 
                            className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-slate-800/50 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-slate-800/25'}`}
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <span className="relative flex h-2 w-2 shrink-0">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-mono font-bold text-slate-100">{symbol}</span>
                                <span className="text-[10px] text-slate-500 truncate max-w-[110px]">{dynamicNames[symbol] || symbol}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="text-xs font-bold font-mono text-emerald-400">
                                {symScore !== undefined ? symScore.toFixed(2) : '--'}
                              </span>
                              <button 
                                onClick={(e) => { 
                                  e.preventDefault(); 
                                  e.stopPropagation(); 
                                  handleToggleWatchlist(symbol, true); 
                                }} 
                                title="Takip Listesinden Çıkar"
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* RSI Filter Card with Smooth Collapsible Accordion */}
            <div className="rounded-xl border border-amber-500/20 bg-[#12161f]/90 shadow-xl backdrop-blur-md overflow-hidden flex flex-col">
              <div 
                onClick={() => setIsFunnelOpen(!isFunnelOpen)}
                className="px-4 py-3.5 border-b border-amber-500/20 bg-amber-500/5 flex items-center justify-between cursor-pointer hover:bg-amber-500/10 transition-colors group select-none"
              >
                <div className="flex items-center space-x-2">
                  <Flame className={`h-4 w-4 transition-colors ${isFunnelOpen ? 'text-amber-400' : 'text-amber-500/60 group-hover:text-amber-400'}`} />
                  <h2 className={`text-[11px] font-semibold tracking-wider uppercase transition-colors ${isFunnelOpen ? 'text-amber-400' : 'text-amber-500/60 group-hover:text-amber-400'}`}>
                    RSI Filtresi
                  </h2>
                </div>
                <div className="flex items-center space-x-2">
                   <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-md">{rsiPassedList.length}</span>
                   <ChevronDown className={`h-4 w-4 text-amber-500/60 transition-transform duration-300 group-hover:text-amber-400 ${!isFunnelOpen ? '-rotate-90' : ''}`} />
                </div>
              </div>

              <div className={`grid transition-all duration-300 ease-in-out ${
                isFunnelOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
              }`}>
                <div className="overflow-hidden">
                  <div className="divide-y divide-slate-800/60 max-h-[250px] lg:max-h-[300px] overflow-y-auto scrollbar-hide">
                    {loadingOverview ? (
                      <div className="p-6 flex items-center justify-center space-x-2 text-xs text-slate-500 font-mono">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" /><span>Taranıyor...</span>
                      </div>
                    ) : rsiPassedList.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">Şu an filtresini geçen hisse yok.</div>
                    ) : (
                      rsiPassedList.map((item) => (
                        <div 
                          key={item.symbol} 
                          onClick={() => handleSelectStockWithScroll(item.symbol)} 
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer ${selectedSymbol === item.symbol ? 'bg-amber-500/10 border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent hover:bg-slate-800/30'}`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] shrink-0" />
                            <span className="text-xs font-mono font-bold text-slate-100">{item.symbol}</span>
                          </div>
                          <div className="text-xs font-bold font-mono text-emerald-400">{item.score.toFixed(2)}</div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="px-4 py-2 bg-amber-500/[0.02] border-t border-slate-800/60 flex items-center justify-center">
                    <button
                      ref={rsiButtonRef}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRsiInfoOpen((prev) => !prev);
                      }}
                      className="inline-flex items-center space-x-1.5 text-[10px] font-medium text-amber-400/80 hover:text-amber-300 transition-colors cursor-pointer select-none"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Filtre Nasıl Çalışır?</span>
                    </button>
                  </div>

                  <div 
                    ref={rsiInfoRef}
                    onClick={(e) => e.stopPropagation()}
                    className={`grid transition-all duration-300 ease-in-out ${
                      isRsiInfoOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="p-3.5 bg-[#161b26] border-t border-amber-500/20 text-xs space-y-2 select-none">
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Bu liste, BIST evrenindeki hisseleri <strong className="text-white">4 Saatlik (4S)</strong> periyotta analiz eder. <strong className="text-purple-400">RSI (14)</strong> indikatörünün <strong className="text-blue-400">düşen trend direncini</strong> yukarı kırdığı hisseleri tespit eder.
                        </p>
                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                          <span>Hesaplama Periyodu:</span>
                          <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">4S / 4 Saat</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex-1 min-w-0 w-full space-y-6">
            
            {/* Chart Container Card */}
            <div ref={chartSectionRef} className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-4 sm:p-5 shadow-2xl backdrop-blur-md flex flex-col">
              {!selectedSymbol ? (
                <div className="h-[450px] flex flex-col items-center justify-center text-slate-500">
                  <Activity className="h-12 w-12 mb-4 opacity-20" />
                  <p>Grafik verisi hazırlanıyor...</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row justify-between gap-6 mb-6">
                    
                    <div className="flex flex-col space-y-4 w-full md:w-auto">
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center space-x-3">
                          <a
                            href={`/detay/${selectedSymbol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${selectedSymbol} detay sayfasını yeni sekmede aç`}
                            className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight leading-none uppercase hover:text-blue-400 transition-colors inline-flex items-center group/title cursor-pointer"
                          >
                            <span>{selectedSymbol}</span>
                            <ExternalLink className="h-5 w-5 sm:h-6 sm:w-6 ml-2.5 opacity-40 group-hover/title:opacity-100 group-hover/title:text-blue-400 transition-all" />
                          </a>

                          <button
                            onClick={() => handleToggleWatchlist(selectedSymbol!, watchlist.includes(selectedSymbol!))}
                            title={watchlist.includes(selectedSymbol!) ? "Takip Listesinden Çıkar" : "Takip Listesine Ekle"}
                            className={`h-7 w-7 sm:h-8 sm:w-8 mt-1 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer shadow-sm ${
                              watchlist.includes(selectedSymbol!)
                                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 hover:scale-105'
                                : 'bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white hover:scale-105'
                            }`}
                          >
                            {watchlist.includes(selectedSymbol!) ? (
                              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                            ) : (
                              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                            )}
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                           <span className="text-[10px] font-mono uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-1 rounded">
                            {chartConfig.interval} / {chartConfig.period}
                           </span>
                           <span className="text-[10px] font-mono text-slate-500 border border-slate-700 bg-slate-800/50 px-2 py-1 rounded">
                             {dynamicNames[selectedSymbol!] || selectedSymbol}
                           </span>
                           {marketData?.has_primary_filter && (
                             <span className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold flex items-center space-x-1 ${marketData.primary_filter_passed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                               <Filter className="h-3 w-3" />
                               <span>{marketData.primary_filter_passed ? 'FİLTRE OK' : 'FİLTRE BEKLENİYOR'}</span>
                             </span>
                           )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                          <div className="flex bg-[#161b26] p-1 rounded-lg border border-slate-800 flex-1 justify-between">
                            {CHART_INTERVALS.map((tf) => (
                              <button key={tf.value} onClick={() => handleIntervalChange(tf.value)} className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors text-center ${chartConfig.interval === tf.value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>{tf.label}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                          <div className="flex bg-[#161b26] p-1 rounded-lg border border-slate-800 flex-1 justify-between">
                            {CHART_PERIODS.map((p) => (
                              <button key={p.value} onClick={() => handlePeriodChange(p.value)} className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors text-center ${chartConfig.period === p.value ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>{p.label}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col justify-center bg-[#161b26]/50 border border-slate-800/80 rounded-2xl p-4 sm:p-5 w-full md:w-auto xl:min-w-[340px] md:self-start">
                      {marketData && !loadingMarket ? (
                        <div className="flex flex-col space-y-4">
                          
                          <div className={`flex items-start justify-between p-2 -mx-2 rounded-lg transition-colors duration-500 ${priceFlash === 'up' ? 'bg-emerald-500/20' : priceFlash === 'down' ? 'bg-rose-500/20' : 'bg-transparent'}`}>
                            <div className={`font-mono text-3xl sm:text-4xl font-bold leading-none transition-colors duration-300 ${priceFlash === 'up' ? 'text-emerald-400' : priceFlash === 'down' ? 'text-rose-400' : 'text-slate-100'}`}>
                              ₺{marketData.current_price.toFixed(2)}
                            </div>
                            <div className="flex flex-col items-end">
                              <div className={`flex items-center space-x-1 font-mono text-sm font-semibold ${marketData.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {marketData.change_pct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                <span>{marketData.change_pct >= 0 ? '+' : ''}{marketData.change_pct}%</span>
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 uppercase font-mono">
                                {bistTime}
                              </span>
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-800/80 w-full"></div>

                          <div className="flex items-center justify-between">
                            <div className={`flex flex-col p-2 -mx-2 rounded-lg transition-colors duration-500 ${scoreFlash === 'up' ? 'bg-emerald-500/20' : scoreFlash === 'down' ? 'bg-rose-500/20' : 'bg-transparent'}`}>
                              <span className={`text-2xl sm:text-3xl font-mono font-bold leading-none transition-colors duration-300 ${scoreFlash === 'up' ? 'text-emerald-400' : scoreFlash === 'down' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {currentScore.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">SKOR</span>
                            </div>
                            <button 
                              onClick={() => setIsRuleDrawerOpen(true)} 
                              title="Kural Karnesini Aç"
                              className="p-3 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 transition-all cursor-pointer flex items-center justify-center"
                            >
                              <SlidersHorizontal className="h-5 w-5 sm:h-6 sm:w-6" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm font-mono text-slate-500 space-x-2 py-4">
                          <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                          <span>Hesaplanıyor...</span>
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="w-full relative flex-1 min-h-[350px]">
                    {chartData?.candles && !loadingMarket ? (
                      <ChartWrapper 
                        key={`${selectedSymbol}-${chartConfig.interval}-${chartConfig.period}`}
                        candles={chartData.candles} 
                        indicators={chartData.indicators} 
                        rsiPane={chartData.rsi_pane} 
                        height={420} 
                      />
                    ) : (
                      <div className="h-[420px] flex items-center justify-center text-slate-600 text-sm">Grafik yükleniyor...</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Top 10 Ranked Lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Highest Scored Top 10 */}
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between bg-emerald-500/5">
                  <div className="flex items-center space-x-2">
                    <Trophy className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">En Yüksek Skorlu 10 Hisse</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">Algoritmik Sıralama</span>
                </div>
                
                <div className="relative">
                  <div className={`divide-y divide-slate-800/60 transition-all duration-500 ease-in-out ${
                    isTopScoredExpanded ? 'max-h-[550px] overflow-y-auto scrollbar-hide' : 'max-h-[215px] overflow-hidden'
                  }`}>
                    {loadingOverview ? (
                      <div className="p-8 text-center text-xs text-slate-500 font-mono">Hesaplanıyor...</div>
                    ) : topScoredList.map((item, idx) => (
                      <div 
                        key={item.symbol} 
                        onClick={() => handleSelectStockWithScroll(item.symbol)} 
                        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <span className={`w-5 text-xs font-mono font-bold ${idx < 3 ? 'text-emerald-400' : 'text-slate-500'}`}>#{idx + 1}</span>
                          <div className="flex flex-col">
                            <span className="text-xs font-mono font-bold text-slate-100">{item.symbol}</span>
                            <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{item.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                           <div className="text-right hidden sm:block">
                              <div className="text-[11px] font-mono text-slate-300">₺{item.current_price.toFixed(2)}</div>
                           </div>
                           <div className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/20">{item.score.toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isTopScoredExpanded && topScoredList.length > 4 && (
                    <div className="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-b from-transparent via-[#12161f]/80 via-40% to-[#070a0f] flex items-end justify-center pb-3 pointer-events-none">
                      <button
                        type="button"
                        onClick={() => setIsTopScoredExpanded(true)}
                        className="pointer-events-auto inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono font-medium shadow-[0_0_12px_rgba(16,185,129,0.15)] transition-all cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <span>Devamını Gör ({topScoredList.length})</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {isTopScoredExpanded && topScoredList.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setIsTopScoredExpanded(false)}
                      className="w-full py-2.5 border-t border-slate-800/60 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.08] flex items-center justify-center space-x-1.5 text-[11px] font-mono text-emerald-400/80 hover:text-emerald-300 transition-colors cursor-pointer group/collapse select-none outline-none"
                    >
                      <span>Daha Az Göster</span>
                      <ChevronUp className="h-3.5 w-3.5 transition-transform duration-200 group-hover/collapse:-translate-y-0.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Highest Priced Top 10 */}
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between bg-blue-500/5">
                  <div className="flex items-center space-x-2">
                    <Gem className="h-4 w-4 text-blue-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400">En Değerli 10 Hisse</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">Birim Fiyat</span>
                </div>
                
                <div className="relative">
                  <div className={`divide-y divide-slate-800/60 transition-all duration-500 ease-in-out ${
                    isTopPricedExpanded ? 'max-h-[550px] overflow-y-auto scrollbar-hide' : 'max-h-[215px] overflow-hidden'
                  }`}>
                    {dynamicTopPriced.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500 font-mono">Yükleniyor...</div>
                    ) : dynamicTopPriced.map((item, idx) => (
                      <TopPricedRow
                        key={item.symbol}
                        item={item}
                        rank={idx}
                        name={dynamicNames[item.symbol] || item.symbol}
                        isSelected={selectedSymbol === item.symbol}
                        onSelect={() => handleSelectStockWithScroll(item.symbol)}
                      />
                    ))}
                  </div>

                  {!isTopPricedExpanded && dynamicTopPriced.length > 4 && (
                    <div className="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-b from-transparent via-[#12161f]/80 via-40% to-[#070a0f] flex items-end justify-center pb-3 pointer-events-none">
                      <button
                        type="button"
                        onClick={() => setIsTopPricedExpanded(true)}
                        className="pointer-events-auto inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px] font-mono font-medium shadow-[0_0_12px_rgba(37,99,235,0.15)] transition-all cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <span>Devamını Gör ({dynamicTopPriced.length})</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {isTopPricedExpanded && dynamicTopPriced.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setIsTopPricedExpanded(false)}
                      className="w-full py-2.5 border-t border-slate-800/60 bg-blue-500/[0.03] hover:bg-blue-500/[0.08] flex items-center justify-center space-x-1.5 text-[11px] font-mono text-blue-400/80 hover:text-blue-300 transition-colors cursor-pointer group/collapse select-none outline-none"
                    >
                      <span>Daha Az Göster</span>
                      <ChevronUp className="h-3.5 w-3.5 transition-transform duration-200 group-hover/collapse:-translate-y-0.5" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      {isRuleDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setIsRuleDrawerOpen(false)} />
          <div className="relative z-10 w-full max-w-md bg-[#12161f] border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-5 border-b border-slate-800 flex justify-between items-start">
              <div className="flex flex-col">
                <span className="font-mono text-xl font-bold text-white">{selectedSymbol} <span className="text-sm font-normal text-slate-400 ml-1">Karnesi</span></span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono font-semibold mt-2 self-start">
                  {currentScore.toFixed(2)} / 100 Puan
                </span>
              </div>
              <button onClick={() => setIsRuleDrawerOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {rulesList.length === 0 ? (
                <div className="p-6 rounded-lg bg-slate-800/30 border border-slate-700/50 text-xs text-slate-500 text-center">Aktif kural bulunmuyor.</div>
              ) : (
                rulesList.map((rule) => (
                  <div key={rule.id} className={`p-4 rounded-lg border ${rule.is_met ? 'bg-emerald-950/15 border-emerald-500/30' : 'bg-slate-800/25 border-slate-800/80'} flex justify-between items-start`}>
                    <div className="flex space-x-3 min-w-0">
                      {rule.is_met ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />}
                      <div className="text-xs text-slate-200 flex flex-col space-y-1.5 min-w-0">
                        <span className="font-semibold truncate">{rule.name}</span>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                          <span className="bg-slate-800/80 px-1.5 py-0.5 rounded">{rule.timeframe?.toUpperCase()}</span>
                          {rule.current_value !== undefined && (
                            <span className="flex items-center space-x-1">
                              <span>Anlık: <strong className="text-slate-300">{Number(rule.current_value).toFixed(2)}</strong></span>
                              <span className="text-slate-500">{rule.condition || '>'}</span>
                              <span>Hedef: <strong className="text-slate-300">{Number(rule.target_value).toFixed(2)}</strong></span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded shrink-0 ml-2">
                      {rule.is_met ? `+${rule.earned_score}` : '0.00'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
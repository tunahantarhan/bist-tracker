'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NotificationBell from '@/components/notifications/NotificationBell';
import StockSearch from '@/components/ui/StockSearch';
import StockAlertDropdown from '@/components/alerts/StockAlertDropdown';
import ScoreGauge from '@/components/ui/ScoreGauge';
import {
  fetchMarketData,
  fetchTicker,
  TickerItem,
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
  Trash2, LogOut, ShieldCheck, Filter, Calendar, Clock,
  SlidersHorizontal, Flame, Trophy, Gem, X, ChevronDown, ChevronUp,
  Search, Plus, ExternalLink, Sparkles, SquareText
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import StockTicker from '@/components/ui/StockTicker';
import MacroKpiGrid from '@/components/ui/MacroKpiGrid';
import RuleConditionText from '@/components/rules/RuleConditionText';
import { clearSession, getAccessToken, getUserSlug, isAdminSession } from '@/lib/auth';
import { useValueFlash } from '@/hooks/useValueFlash';
import { tfLabel } from '@/lib/timeframes';

const CHART_INTERVALS = [
  { value: '5m', label: '5Dk' }, { value: '15m', label: '15Dk' },
  { value: '1h', label: '1S' }, { value: '4h', label: '4S' }, { value: '1d', label: '1G' },
];

const CHART_PERIODS = [
  { value: '1mo', label: '1A' }, { value: '3mo', label: '3A' },
  { value: '6mo', label: '6A' }, { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' }, { value: '5y', label: '5Y' },
];

type ChartConfig = { interval: string; period: string };

// Default chart configuration for each primary (RSI) filter timeframe
const DEFAULT_CONFIG_BY_TIMEFRAME: Record<string, ChartConfig> = {
  '5m': { interval: '5m', period: '1mo' },
  '15m': { interval: '15m', period: '1mo' },
  '1h': { interval: '1h', period: '3mo' },
  '4h': { interval: '4h', period: '6mo' },
  '1d': { interval: '1d', period: '6mo' },
};

const getDefaultChartConfig = (tf?: string): ChartConfig =>
  DEFAULT_CONFIG_BY_TIMEFRAME[tf?.toLowerCase() || '4h'] || DEFAULT_CONFIG_BY_TIMEFRAME['4h'];

// Session flags live in localStorage; reading them through useSyncExternalStore keeps SSR and hydration consistent
const noopSubscribe = () => () => {};

interface TopPricedRowProps {
  item: TickerItem;
  rank: number;
  name: string;
  isSelected: boolean;
  onSelect: () => void;
}

const TopPricedRow = ({ item, rank, name, isSelected, onSelect }: TopPricedRowProps) => {
  const flash = useValueFlash(item.symbol, item.current_price, 3000);

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
  const isAuthenticated = useSyncExternalStore(noopSubscribe, () => !!getAccessToken(), () => false);
  const isAdmin = useSyncExternalStore(noopSubscribe, isAdminSession, () => false);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  // Pending state drives the UI; the ref is the real mutex (state updates are async, so two quick clicks could both pass a state check)
  const [watchlistPending, setWatchlistPending] = useState<Record<string, boolean>>({});
  const watchlistInFlightRef = useRef<Set<string>>(new Set());

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const selectedSymbolRef = useRef<string | null>(null);

  const chartSectionRef = useRef<HTMLDivElement>(null);
  // Last payload per symbol/interval/period so switching back renders instantly
  const chartCacheRef = useRef<Record<string, MarketData>>({});

  const [isWatchlistOpen, setIsWatchlistOpen] = useState<boolean>(true);
  const [isFunnelOpen, setIsFunnelOpen] = useState<boolean>(true);
  // Below lg only one side list is shown at a time so the chart stays near the top
  const [mobileListTab, setMobileListTab] = useState<'watchlist' | 'rsi'>('watchlist');

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [isTopScoredExpanded, setIsTopScoredExpanded] = useState<boolean>(false);
  const [isTopPricedExpanded, setIsTopPricedExpanded] = useState<boolean>(false);

  const [isRsiInfoOpen, setIsRsiInfoOpen] = useState<boolean>(false);
  const rsiInfoRef = useRef<HTMLDivElement>(null);
  const rsiButtonRef = useRef<HTMLButtonElement>(null);

  const [isRuleDrawerOpen, setIsRuleDrawerOpen] = useState<boolean>(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);

  const [chartConfig, setChartConfig] = useState<ChartConfig>(getDefaultChartConfig('4h'));
  const chartConfigRef = useRef<ChartConfig>(chartConfig);
  // The chart defaults follow the primary filter timeframe until the user picks something
  const chartConfigTouchedRef = useRef(false);

  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState<boolean>(false);

  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [liveTickerData, setLiveTickerData] = useState<TickerItem[]>([]);
  const [bistTime, setBistTime] = useState<string>('--:--:--');

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
    chartConfigRef.current = chartConfig;
  }, [selectedSymbol, chartConfig]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRsiInfoOpen]);

  const loadingOverview = overview === null;
  const activePrimaryFilterTf = marketData?.primary_filter_timeframe || overview?.primary_filter_timeframe || '4h';

  // Score and company name per symbol come from the overview scan
  const { stockScores, stockNames } = useMemo(() => {
    const scores: Record<string, number> = {};
    const names: Record<string, string> = {};
    overview?.items.forEach((item) => {
      scores[item.symbol] = item.score;
      names[item.symbol] = item.name;
    });
    return { stockScores: scores, stockNames: names };
  }, [overview]);

  const handleSelectStockWithScroll = (symbol: string) => {
    setSelectedSymbol(symbol);
    if (window.innerWidth < 1024 && chartSectionRef.current) {
      chartSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const updateChartConfig = (next: ChartConfig | ((prev: ChartConfig) => ChartConfig)) => {
    chartConfigTouchedRef.current = true;
    setChartConfig(next);
  };

  const handleSelectRsiStockWithScroll = (symbol: string) => {
    updateChartConfig(getDefaultChartConfig(activePrimaryFilterTf));
    handleSelectStockWithScroll(symbol);
  };

  const loadMarket = useCallback(async (symbol: string, config: ChartConfig, isBackground = false, signal?: AbortSignal) => {
    const cacheKey = `${symbol}_${config.interval}_${config.period}`;
    try {
      const data = await fetchMarketData(symbol, config.interval, config.period, signal);
      chartCacheRef.current[cacheKey] = data;
      // A background refresh must not overwrite a newer selection or chart setting
      const stillCurrent = selectedSymbolRef.current === symbol && chartConfigRef.current === config;
      if (!isBackground || stillCurrent) setMarketData(data);
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) console.warn('Market data fetch warning:', err);
    } finally {
      if (!isBackground) setLoadingMarket(false);
    }
  }, []);

  useEffect(() => {
    // Read storage directly: during hydration `isAuthenticated` is still the server value (false)
    if (!getAccessToken()) {
      router.push('/giris');
      return;
    }
    fetchWatchlist()
      .then((data) => setWatchlist(data.map((item) => item.symbol)))
      .catch((err) => console.warn('Watchlist init warning:', err));
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 60);
    return () => clearTimeout(timer);
  }, [isWatchlistOpen, isFunnelOpen]);

  useEffect(() => {
    // Market data is delayed by 15 minutes; outside the session the clock shows the close time
    const updateClock = () => {
      const delayedIst = new Date(Date.now() + 3 * 3600 * 1000 - 15 * 60 * 1000);
      const day = delayedIst.getUTCDay();
      const seconds = delayedIst.getUTCHours() * 3600 + delayedIst.getUTCMinutes() * 60 + delayedIst.getUTCSeconds();
      const isOpen = day !== 0 && day !== 6 && seconds >= 10 * 3600 && seconds < 18 * 3600 + 10 * 60;
      setBistTime(isOpen ? delayedIst.toISOString().substring(11, 19) : '18:10:00');
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Selected symbol or chart settings changed: show cached data instantly, then fetch fresh
  useEffect(() => {
    if (!selectedSymbol || !isAuthenticated) return;
    const controller = new AbortController();
    const cached = chartCacheRef.current[`${selectedSymbol}_${chartConfig.interval}_${chartConfig.period}`];
    const run = async () => {
      if (cached) {
        setMarketData(cached);
        setLoadingMarket(false);
      } else {
        setLoadingMarket(true);
      }
      await loadMarket(selectedSymbol, chartConfig, false, controller.signal);
    };
    run();
    return () => controller.abort();
  }, [selectedSymbol, chartConfig, isAuthenticated, loadMarket]);

  // Single heartbeat: ticker band, universe overview and the open chart refresh together every 15s
  useEffect(() => {
    if (!isAuthenticated) return;

    const runHeartbeat = async () => {
      const currentSym = selectedSymbolRef.current;
      await Promise.allSettled([
        fetchTicker().then(setLiveTickerData),
        fetchMarketOverview().then((ov) => {
          setOverview(ov);
          if (!chartConfigTouchedRef.current && ov.primary_filter_timeframe) {
            setChartConfig(getDefaultChartConfig(ov.primary_filter_timeframe));
          }
        }),
        currentSym ? loadMarket(currentSym, chartConfigRef.current, true) : Promise.resolve(),
      ]);
    };

    runHeartbeat();
    const heartbeatTimer = setInterval(runHeartbeat, 15000);
    return () => clearInterval(heartbeatTimer);
  }, [isAuthenticated, loadMarket]);

  const handleToggleWatchlist = async (symbol: string, isAdded: boolean) => {
    // Prevent duplicate triggers if an action is already in flight for this symbol
    if (watchlistInFlightRef.current.has(symbol)) return;
    watchlistInFlightRef.current.add(symbol);
    setWatchlistPending((prev) => ({ ...prev, [symbol]: true }));

    try {
      if (isAdded) {
        await removeFromWatchlist(symbol);
        setWatchlist((prev) => prev.filter((s) => s !== symbol));
      } else {
        await addToWatchlist(symbol);
        setWatchlist((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
        handleSelectStockWithScroll(symbol);
        setIsMobileSearchOpen(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'İşlem başarısız oldu');
    } finally {
      watchlistInFlightRef.current.delete(symbol);
      setWatchlistPending((prev) => {
        const next = { ...prev };
        delete next[symbol];
        return next;
      });
    }
  };

  const handleIntervalChange = (newInterval: string) => {
    updateChartConfig((prev) => {
      let nextPeriod = prev.period;
      if (newInterval === '5m' || newInterval === '15m') nextPeriod = '1mo';
      else if ((newInterval === '1h' || newInterval === '4h') && prev.period === '5y') nextPeriod = '1y';
      return { interval: newInterval, period: nextPeriod };
    });
  };

  const handlePeriodChange = (newPeriod: string) => {
    updateChartConfig((prev) => {
      let nextInterval = prev.interval;
      if (newPeriod === '5y' && prev.interval !== '1d') nextInterval = '1d';
      else if (newPeriod !== '1mo' && (prev.interval === '5m' || prev.interval === '15m')) nextInterval = '4h';
      return { interval: nextInterval, period: newPeriod };
    });
  };

  const selectedData = marketData && marketData.symbol === selectedSymbol ? marketData : null;
  const currentScore = selectedData?.score ?? (selectedSymbol ? stockScores[selectedSymbol] ?? 0 : 0);
  const scoreFlash = useValueFlash(selectedSymbol, selectedSymbol ? currentScore : undefined);
  const priceFlash = useValueFlash(selectedSymbol, selectedData?.current_price);

  if (!isAuthenticated) return <div className="min-h-screen bg-[#0b0e14]" />;

  const rulesList = selectedData?.rules_breakdown || [];
  const rsiPassedList: StockOverviewItem[] = overview?.rsi_passed || [];
  const topScoredList: StockOverviewItem[] = overview?.top_scored || [];
  
  const dynamicTopPriced = [...liveTickerData]
    .sort((a, b) => b.current_price - a.current_price)
    .slice(0, 10);


  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-200 overflow-x-clip">
      {/* Top Navbar with True Sticky & Backdrop-Blur */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md px-4 sm:px-6 min-h-[68px] flex items-center transition-all">
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
                        router.push(`/kullanici/${getUserSlug()}`);
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
                          router.push('/admin');
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
                        clearSession();
                        router.push('/giris');
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

            {/* Mobile list switcher */}
            <div role="tablist" className="lg:hidden grid grid-cols-2 gap-1 rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-1">
              {([
                { key: 'watchlist', label: 'Takip Listesi', count: watchlist.length, active: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
                { key: 'rsi', label: 'RSI Filtresi', count: rsiPassedList.length, active: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={mobileListTab === tab.key}
                  onClick={() => setMobileListTab(tab.key)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                    mobileListTab === tab.key ? tab.active : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="rounded-md bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px]">{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Watchlist Card with Smooth Collapsible Accordion & Circular Score Gauges */}
            <div className={`rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-xl backdrop-blur-md overflow-hidden flex-col ${mobileListTab === 'watchlist' ? 'flex' : 'hidden lg:flex'}`}>
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
                  <div className="divide-y divide-slate-800/60 max-h-[220px] lg:max-h-[300px] overflow-y-auto scrollbar-hide">
                    {watchlist.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">Listeniz boş. Arama çubuğundan hisse ekleyin.</div>
                    ) : (
                      watchlist.map((symbol) => {
                        const isSelected = selectedSymbol === symbol;
                        const symScore = stockScores[symbol];
                        const isMutating = !!watchlistPending[symbol];

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
                                <span className="text-[10px] text-slate-500 truncate max-w-[110px]">{stockNames[symbol] || symbol}</span>
                              </div>
                            </div>

                            {/* Open-bottom Speedometer Score Gauge for Watchlist Item */}
                            <div className="flex items-center space-x-2 shrink-0">
                              <ScoreGauge score={symScore} size="sm" />

                              <button 
                                disabled={isMutating}
                                onClick={(e) => { 
                                  e.preventDefault(); 
                                  e.stopPropagation(); 
                                  handleToggleWatchlist(symbol, true); 
                                }} 
                                title="Takip Listesinden Çıkar"
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isMutating ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
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
            <div className={`rounded-xl border border-amber-500/20 bg-[#12161f]/90 shadow-xl backdrop-blur-md overflow-hidden flex-col ${mobileListTab === 'rsi' ? 'flex' : 'hidden lg:flex'}`}>
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
                  <div className="divide-y divide-slate-800/60 max-h-[220px] lg:max-h-[300px] overflow-y-auto scrollbar-hide">
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
                          onClick={() => handleSelectRsiStockWithScroll(item.symbol)} 
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
                          Bu liste, BIST evrenindeki hisseleri <strong className="text-white">{tfLabel(activePrimaryFilterTf, 'long')}</strong> periyotta analiz eder. <strong className="text-purple-400">RSI (14)</strong> indikatörünün <strong className="text-blue-400">düşen trend direncini</strong> yukarı kırdığı hisseleri tespit eder.
                        </p>
                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                          <span>Hesaplama Periyodu:</span>
                          <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {tfLabel(activePrimaryFilterTf, 'short')} / {tfLabel(activePrimaryFilterTf, 'full')}
                          </span>
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
                <div className="min-h-[460px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800/90 rounded-xl bg-[#161b26]/30">
                  <div className="h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.15)]">
                    <SlidersHorizontal className="h-7 w-7 opacity-80" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-200 tracking-tight">
                    İncelemek İçin Bir Hisse Seçin
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
                    Arama çubuğundan, listelerden veya RSI kırılım filtresinden dilediğiniz hisseye tıklayarak teknik analizini ve kural karnesini görüntüleyin.
                  </p>
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
                            disabled={watchlistPending[selectedSymbol!]}
                            onClick={() => handleToggleWatchlist(selectedSymbol!, watchlist.includes(selectedSymbol!))}
                            title={watchlist.includes(selectedSymbol!) ? "Takip Listesinden Çıkar" : "Takip Listesine Ekle"}
                            className={`h-7 w-7 sm:h-8 sm:w-8 mt-1 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
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

                          {/* Rule Alert Dropdown on Chart Header */}
                          <div className="mt-1">
                            <StockAlertDropdown key={selectedSymbol} symbol={selectedSymbol} />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                           <span className="text-[10px] font-mono uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-1 rounded">
                            {chartConfig.interval} / {chartConfig.period}
                           </span>
                           <span className="text-[10px] font-mono text-slate-500 border border-slate-700 bg-slate-800/50 px-2 py-1 rounded">
                             {stockNames[selectedSymbol!] || selectedSymbol}
                           </span>

                           {selectedData?.has_primary_filter && (
                             <span className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold flex items-center space-x-1.5 ${
                               selectedData.primary_filter_passed 
                                 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                 : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                             }`}>
                               <Filter className="h-3 w-3" />
                               <span>{selectedData.primary_filter_passed ? 'FİLTRE OK' : 'FİLTRE BEKLENİYOR'}</span>
                               <span className="opacity-80">({tfLabel(activePrimaryFilterTf, 'short')})</span>
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

                    {/* Chart Header Metrics Container */}
                    <div className="flex flex-col justify-center bg-[#161b26]/50 border border-slate-800/80 rounded-2xl p-4 sm:p-5 w-full md:w-auto xl:min-w-[340px] md:self-start">
                      {selectedData && !loadingMarket ? (
                        <div className="flex flex-col space-y-4">
                          
                          <div className={`flex items-start justify-between p-2 -mx-2 rounded-lg transition-colors duration-500 ${priceFlash === 'up' ? 'bg-emerald-500/20' : priceFlash === 'down' ? 'bg-rose-500/20' : 'bg-transparent'}`}>
                            <div className={`font-mono text-3xl sm:text-4xl font-bold leading-none transition-colors duration-300 ${priceFlash === 'up' ? 'text-emerald-400' : priceFlash === 'down' ? 'text-rose-400' : 'text-slate-100'}`}>
                              ₺{selectedData.current_price.toFixed(2)}
                            </div>
                            <div className="flex flex-col items-end">
                              <div className={`flex items-center space-x-1 font-mono text-sm font-semibold ${selectedData.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {selectedData.change_pct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                <span>{selectedData.change_pct >= 0 ? '+' : ''}{selectedData.change_pct}%</span>
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 uppercase font-mono">
                                {bistTime}
                              </span>
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-800/80 w-full"></div>

                          {/* Gauge and Drawer Button Row */}
                          <div className="flex items-center justify-between">
                            <div className={`flex items-center space-x-3 p-1.5 -mx-1.5 rounded-lg transition-colors duration-500 ${scoreFlash === 'up' ? 'bg-emerald-500/20' : scoreFlash === 'down' ? 'bg-rose-500/20' : 'bg-transparent'}`}>
                              <ScoreGauge score={currentScore} size="md" />
                              <div className="flex flex-col">
                                <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                                  Kural Skoru
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  / 100 Puan
                                </span>
                              </div>
                            </div>

                            <button 
                              onClick={() => setIsRuleDrawerOpen(true)} 
                              title="Kural Karnesini Aç"
                              className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/80 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center shadow-md"
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
                    {selectedData && !loadingMarket ? (
                      <ChartWrapper 
                        key={`${selectedSymbol}-${chartConfig.interval}-${chartConfig.period}`}
                        candles={selectedData.candles}
                        indicators={selectedData.indicators}
                        rsiPane={selectedData.rsi_pane}
                        height={420} 
                      />
                    ) : (
                      <div className="h-[420px] flex items-center justify-center text-slate-600 text-sm">Grafik yükleniyor...</div>
                    )}
                  </div>
                </>
              )}
            </div>

            <MacroKpiGrid/>

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
                        name={stockNames[item.symbol] || item.symbol}
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

      {/* Legal Notice Footer */}
      <footer className="mt-12 border-t border-slate-800/60 bg-[#080a0f] px-6 py-6 text-center select-none">
        <div className="max-w-5xl mx-auto flex flex-col items-center space-y-2">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            <span>Yasal Uyarı & Bilgilendirme</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Burada yer alan yatırım bilgi, yorum ve tavsiyeleri yatırım danışmanlığı kapsamında değildir. 
            Platformumuzda sunulan tüm veriler, göstergeler ve algoritmik skorlar kullanıcı tarafından belirlenen 
            veya sisteme tanımlanmış matematiksel teknik analiz koşullarının izlenmesi amacıyla üretilmekte olup 
            hiçbir şekilde alım-satım tavsiyesi niteliği taşımamaktadır.
          </p>
          <p className="text-[10px] text-slate-400 font-mono">
            © {new Date().getFullYear()} BIST Tracker. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>

      {/* Rules Breakdown Drawer with Clarified Condition Text */}
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
                          <span className="bg-slate-800/80 px-1.5 py-0.5 rounded">{tfLabel(rule.timeframe)}</span>
                          <RuleConditionText rule={rule} />
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
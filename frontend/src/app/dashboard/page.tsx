'use client';

import { useState, useEffect } from 'react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NotificationBell from '@/components/notifications/NotificationBell';
import StockSearch from '@/components/ui/StockSearch';
import {
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
  User,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  Trash2,
  LogOut,
  ShieldCheck,
  Filter,
  Calendar,
  Clock,
  SlidersHorizontal,
  Flame,
  Trophy,
  Gem,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StockTicker from '@/components/ui/StockTicker';

// Bu liste sadece ilk yükleme anında fallback olarak kalacak
const TICKER_NAMES: Record<string, string> = {
  "THYAO": "Türk Hava Yolları A.O.",
  "KCHOL": "Koç Holding A.Ş.",
  "GARAN": "Garanti BBVA"
};

const CHART_INTERVALS = [
  { value: '5m', label: '5Dk' },
  { value: '15m', label: '15Dk' },
  { value: '1h', label: '1S' },
  { value: '4h', label: '4S' },
  { value: '1d', label: '1G' },
];

const CHART_PERIODS = [
  { value: '1mo', label: '1A' },
  { value: '3mo', label: '3A' },
  { value: '6mo', label: '6A' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  
  // Tüm hisselerin dinamik isim haritası (Backend'den beslenecek)
  const [dynamicNames, setDynamicNames] = useState<Record<string, string>>(TICKER_NAMES);

  // Layout States
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState<boolean>(true);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState<boolean>(true);
  const [isFunnelOpen, setIsFunnelOpen] = useState<boolean>(false);
  const [isRuleDrawerOpen, setIsRuleDrawerOpen] = useState<boolean>(false);
  
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);

  const [chartConfig, setChartConfig] = useState<{ interval: string; period: string }>({
    interval: '4h',
    period: '6mo',
  });

  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState<boolean>(false);

  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [stockScores, setStockScores] = useState<Record<string, number>>({});

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/auth');
      return;
    }
    setIsAuthenticated(true);
    setIsAdmin(localStorage.getItem('is_admin') === 'true');
    initializeDashboard();
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
    return () => clearTimeout(timer);
  }, [isLeftPanelOpen, isWatchlistOpen, isFunnelOpen]);

  const initializeDashboard = async () => {
    try {
      const [watchlistData, overviewData] = await Promise.allSettled([
        fetchWatchlist(),
        fetchMarketOverview(),
      ]);

      let initialSymbol: string | null = null;

      if (watchlistData.status === 'fulfilled') {
        const symbols = watchlistData.value.map((item: any) => item.symbol);
        setWatchlist(symbols);
        if (symbols.length > 0) initialSymbol = symbols[0];
      }

      if (overviewData.status === 'fulfilled') {
        const ov = overviewData.value;
        setOverview(ov);
        const scoresMap: Record<string, number> = {};
        const namesMap: Record<string, string> = { ...TICKER_NAMES };
        
        ov.items.forEach((item) => {
          scoresMap[item.symbol] = item.score;
          namesMap[item.symbol] = item.name; // Dinamik isimleri DB'den haritaya işliyoruz
        });
        
        setStockScores(scoresMap);
        setDynamicNames(namesMap);

        if (!initialSymbol && ov.top_scored.length > 0) {
          initialSymbol = ov.top_scored[0].symbol;
        }
      }

      if (initialSymbol) setSelectedSymbol(initialSymbol);
    } catch (err) {
      console.warn('Dashboard başlatılırken uyarı:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const handleToggleWatchlist = async (symbol: string, isAdded: boolean) => {
    try {
      if (isAdded) {
        await removeFromWatchlist(symbol);
        const updatedList = watchlist.filter((s) => s !== symbol);
        setWatchlist(updatedList);

        if (selectedSymbol === symbol) {
          if (updatedList.length > 0) {
            setSelectedSymbol(updatedList[0]);
          } else if (overview?.top_scored?.length) {
            setSelectedSymbol(overview.top_scored[0].symbol);
          } else {
            setSelectedSymbol(null);
            setMarketData(null);
          }
        }
      } else {
        await addToWatchlist(symbol);
        setWatchlist((prev) => [...prev, symbol]);
        setSelectedSymbol(symbol);
        setIsMobileSearchOpen(false);
      }
    } catch (err: any) {
      alert(err.message);
    }
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

  useEffect(() => {
    if (!selectedSymbol || !isAuthenticated) return;

    const controller = new AbortController();

    const loadMarket = async () => {
      setLoadingMarket(true);
      try {
        const data = await fetchMarketData(selectedSymbol, chartConfig.interval, chartConfig.period, controller.signal);
        setMarketData(data);
        if (data.score !== undefined) setStockScores((prev) => ({ ...prev, [selectedSymbol]: data.score! }));
      } catch (err: any) {
        if (err?.name !== 'AbortError') console.warn('Piyasa verisi çekilirken uyarı:', err?.message);
      } finally {
        if (!controller.signal.aborted) setLoadingMarket(false);
      }
    };

    loadMarket();
    return () => controller.abort();
  }, [selectedSymbol, chartConfig, isAuthenticated]);

  if (!isAuthenticated) return <div className="min-h-screen bg-[#0b0e14]" />;

  const currentScore = marketData?.score ?? (selectedSymbol ? stockScores[selectedSymbol] ?? 0 : 0);
  const rulesList = marketData?.rules_breakdown || [];
  const passedRulesCount = rulesList.filter((r) => r.is_met).length;

  const rsiPassedList: StockOverviewItem[] = overview?.rsi_passed || [];
  const topScoredList: StockOverviewItem[] = overview?.top_scored || [];
  const topPricedList: StockOverviewItem[] = overview?.top_priced || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-200 overflow-x-hidden">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b0e14]/95 backdrop-blur-md px-4 sm:px-6 min-h-[68px] flex items-center">
        {isMobileSearchOpen ? (
          /* Sadece Arama Çubuğu (Mobil Açık Durum) */
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
          /* Normal Header (Arama Kapalı) */
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

              <DropdownMenu>
                <DropdownMenuTrigger className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-all outline-none">
                  <User className="h-4 w-4 text-slate-300" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 border-slate-800 bg-[#12161f] text-slate-200 p-1.5 z-50">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-slate-400 px-2 py-1.5">Hesabım</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-800/80 my-1" />
                    <DropdownMenuItem onClick={() => { const slug = localStorage.getItem('user_slug') || 'demo'; router.push(`/kullanici/${slug}`); }} className="cursor-pointer py-2 px-2.5 rounded-md hover:bg-slate-800/80">
                      <User className="mr-2 h-4 w-4 text-slate-400" /><span>Profil</span>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem onClick={() => router.push('/admin')} className="cursor-pointer py-2 px-2.5 rounded-md hover:bg-slate-800/80 text-emerald-400">
                        <ShieldCheck className="mr-2 h-4 w-4 text-emerald-500" /><span>Admin Paneli</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onClick={() => { localStorage.removeItem('access_token'); localStorage.removeItem('is_admin'); router.push('/auth'); }} className="mt-1 cursor-pointer py-2 px-2.5 rounded-md bg-rose-950/30 text-rose-400 border border-rose-500/10 hover:!bg-rose-900/45">
                      <LogOut className="mr-2 h-4 w-4 text-rose-400" /><span>Çıkış Yap</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </header>

      <StockTicker />

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* 1. LEFT SIDEBAR: Accordions (Desktop & Mobile) */}
          <aside className={`transition-all duration-300 shrink-0 space-y-4 ${isLeftPanelOpen ? 'w-full lg:w-72' : 'w-full lg:w-16'}`}>
            {isLeftPanelOpen ? (
              <>
                <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-xl backdrop-blur-md overflow-hidden flex flex-col">
                  <div 
                    onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                    className="px-4 py-3.5 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors group select-none"
                  >
                    <h2 className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">Takip Listesi</h2>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded-md">{watchlist.length}</span>
                      <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-300 ${!isWatchlistOpen ? '-rotate-90' : ''}`} />
                    </div>
                  </div>

                  {isWatchlistOpen && (
                    <div className="divide-y divide-slate-800/60 max-h-[250px] lg:max-h-[300px] overflow-y-auto scrollbar-hide">
                      {watchlist.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">Listeniz boş. Arama çubuğundan hisse ekleyin.</div>
                      ) : (
                        watchlist.map((symbol) => {
                          const isSelected = selectedSymbol === symbol;
                          const symScore = stockScores[symbol];
                          return (
                            <div key={symbol} onClick={() => setSelectedSymbol(symbol)} className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-slate-800/50 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-slate-800/25'}`}>
                              <div className="flex items-center space-x-3 min-w-0">
                                <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span></span>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-mono font-bold text-slate-100">{symbol}</span>
                                  {/* DINAMIK İSİM BURADA ÇEKİLİYOR */}
                                  <span className="text-[10px] text-slate-500 truncate max-w-[110px]">{dynamicNames[symbol] || symbol}</span>
                                </div>
                              </div>
                              {/* YENİ SÜRGÜLÜ SİLME BUTONU (İÇ İÇE GEÇMEYİ ENGELLER) */}
                              <div className="relative flex items-center justify-end w-12 h-6 overflow-hidden">
                                <div className="absolute right-0 flex items-center transition-transform duration-200 group-hover:translate-x-12">
                                  <span className="text-xs font-bold font-mono text-emerald-400">{symScore !== undefined ? symScore.toFixed(2) : '--'}</span>
                                </div>
                                <button 
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleWatchlist(symbol, true); }} 
                                  className="absolute right-0 p-1.5 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 translate-x-12 group-hover:translate-x-0 transition-transform duration-200"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-[#12161f]/90 shadow-xl backdrop-blur-md overflow-hidden flex flex-col">
                  <div 
                    onClick={() => setIsFunnelOpen(!isFunnelOpen)}
                    className="px-4 py-3.5 border-b border-amber-500/20 bg-amber-500/5 flex items-center justify-between cursor-pointer hover:bg-amber-500/10 transition-colors group select-none"
                  >
                    <div className="flex items-center space-x-2">
                      <Flame className={`h-4 w-4 transition-colors ${isFunnelOpen ? 'text-amber-400' : 'text-amber-500/60 group-hover:text-amber-400'}`} />
                      <h2 className={`text-[11px] font-semibold tracking-wider uppercase transition-colors ${isFunnelOpen ? 'text-amber-400' : 'text-amber-500/60 group-hover:text-amber-400'}`}>RSI Filtresi</h2>
                    </div>
                    <div className="flex items-center space-x-2">
                       <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-md">{rsiPassedList.length}</span>
                       <ChevronDown className={`h-4 w-4 text-amber-500/60 transition-transform duration-300 group-hover:text-amber-400 ${!isFunnelOpen ? '-rotate-90' : ''}`} />
                    </div>
                  </div>

                  {isFunnelOpen && (
                    <div className="divide-y divide-slate-800/60 max-h-[250px] lg:max-h-[300px] overflow-y-auto scrollbar-hide">
                      {loadingOverview ? (
                        <div className="p-6 flex items-center justify-center space-x-2 text-xs text-slate-500 font-mono">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" /><span>Taranıyor...</span>
                        </div>
                      ) : rsiPassedList.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">Şu an filtresini geçen hisse yok.</div>
                      ) : (
                        rsiPassedList.map((item) => (
                          <div key={item.symbol} onClick={() => setSelectedSymbol(item.symbol)} className={`flex items-center justify-between px-4 py-3 cursor-pointer ${selectedSymbol === item.symbol ? 'bg-amber-500/10 border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent hover:bg-slate-800/30'}`}>
                            <div className="flex items-center space-x-3 min-w-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] shrink-0" />
                              <span className="text-xs font-mono font-bold text-slate-100">{item.symbol}</span>
                            </div>
                            <div className="text-xs font-bold font-mono text-emerald-400">{item.score.toFixed(2)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden lg:flex flex-col gap-2 max-h-[600px] overflow-auto scrollbar-hide p-1 mt-2">
                 {watchlist.map((symbol) => {
                    const isSelected = selectedSymbol === symbol;
                    const score = stockScores[symbol] !== undefined ? Math.round(stockScores[symbol]) : 0;
                    return (
                      <button 
                        key={symbol} 
                        onClick={() => setSelectedSymbol(symbol)} 
                        title={symbol}
                        className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-all ${isSelected ? 'bg-blue-600/15 border-blue-500/40 shadow-sm' : 'bg-[#12161f]/80 border-slate-800 hover:bg-slate-800'}`}
                      >
                        <span className={`text-[10px] font-mono font-bold ${isSelected ? 'text-blue-400' : 'text-slate-300'}`}>{symbol}</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 mt-0.5">{score}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </aside>

          {/* 2. RIGHT MAIN WORKSPACE */}
          <div className="flex-1 min-w-0 w-full space-y-6">
            
            <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-4 sm:p-5 shadow-2xl backdrop-blur-md flex flex-col">
              {!selectedSymbol ? (
                <div className="h-[450px] flex flex-col items-center justify-center text-slate-500">
                  <Activity className="h-12 w-12 mb-4 opacity-20" />
                  <p>Grafik verisi hazırlanıyor...</p>
                </div>
              ) : (
                <>
                  {/* ÇİZİMİNE BİREBİR UYGUN ÜST YERLEŞİM (Responsive Desktop & Mobile) */}
                  <div className="flex flex-col md:flex-row justify-between gap-6 mb-6">
                    
                    {/* SOL TARAF: İsim, Rozetler ve Periyotlar (Alt Alta) */}
                    <div className="flex flex-col space-y-4 w-full md:w-auto">
                      {/* Hisse İsmi ve Rozetler */}
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-baseline space-x-3">
                          <h3 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight leading-none uppercase">
                            {selectedSymbol}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                           <span className="text-[10px] font-mono uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-1 rounded">
                            {chartConfig.interval} / {chartConfig.period}
                           </span>
                           {/* Şirket ismi artık her ekranda şık gri bir rozet olarak kalacak */}
                           <span className="text-[10px] font-mono text-slate-500 border border-slate-700 bg-slate-800/50 px-2 py-1 rounded">
                             {dynamicNames[selectedSymbol!] || selectedSymbol}
                           </span>
                           {marketData?.has_primary_filter && (
                             <span className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold flex items-center space-x-1 ${marketData.primary_filter_passed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                               <Filter className="h-3 w-3" />
                               <span>{marketData.primary_filter_passed ? 'FİLTRE OK' : 'BEKLENİYOR'}</span>
                             </span>
                           )}
                        </div>
                      </div>

                      {/* Zaman ve Menzil Kontrolleri (Alt Alta, Eşit Genişlikte, Renkli ve İkonlu) */}
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

                    {/* SAĞ TARAF: Çerçeveli Fiyat ve Skor Kutusu (Kısaltıldı ve Yukarı Hizalandı) */}
                    <div className="flex flex-col justify-center bg-[#161b26]/50 border border-slate-800/80 rounded-2xl p-4 sm:p-5 w-full md:w-auto xl:min-w-[340px] md:self-start">
                      {marketData && !loadingMarket ? (
                        <div className="flex flex-col space-y-4">
                          {/* Fiyat ve Değişim (Üstte) */}
                          <div className="flex items-center justify-between">
                            <div className="font-mono text-3xl sm:text-4xl font-bold text-slate-100 leading-none">
                              ₺{marketData.current_price.toFixed(2)}
                            </div>
                            <div className={`flex items-center space-x-1 font-mono text-sm font-semibold ${marketData.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {marketData.change_pct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                              <span>{marketData.change_pct >= 0 ? '+' : ''}{marketData.change_pct}%</span>
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-800/80 w-full"></div>

                          {/* Skor ve Karne Butonu (Altta) */}
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400 leading-none">
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

                  {/* GRAFİK ALANI */}
                  <div className="w-full relative flex-1 min-h-[350px]">
                    {marketData?.candles && !loadingMarket ? (
                      <ChartWrapper candles={marketData.candles} indicators={marketData.indicators} rsiPane={marketData.rsi_pane} height={420} />
                    ) : (
                      <div className="h-[420px] flex items-center justify-center text-slate-600 text-sm">Grafik yükleniyor...</div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between bg-emerald-500/5">
                  <div className="flex items-center space-x-2">
                    <Trophy className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">En Yüksek Skorlu 10</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">Algoritmik Sıralama</span>
                </div>
                <div className="divide-y divide-slate-800/60 max-h-[340px] overflow-y-auto scrollbar-hide">
                  {loadingOverview ? (
                    <div className="p-8 text-center text-xs text-slate-500 font-mono">Hesaplanıyor...</div>
                  ) : topScoredList.map((item, idx) => (
                    <div key={item.symbol} onClick={() => setSelectedSymbol(item.symbol)} className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors">
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
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between bg-blue-500/5">
                  <div className="flex items-center space-x-2">
                    <Gem className="h-4 w-4 text-blue-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400">En Değerli 10 Hisse</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">Birim Fiyat</span>
                </div>
                <div className="divide-y divide-slate-800/60 max-h-[340px] overflow-y-auto scrollbar-hide">
                  {loadingOverview ? (
                    <div className="p-8 text-center text-xs text-slate-500 font-mono">Yükleniyor...</div>
                  ) : topPricedList.map((item, idx) => (
                    <div key={item.symbol} onClick={() => setSelectedSymbol(item.symbol)} className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className={`w-5 text-xs font-mono font-bold ${idx < 3 ? 'text-blue-400' : 'text-slate-500'}`}>#{idx + 1}</span>
                        <div className="flex flex-col">
                          <span className="text-xs font-mono font-bold text-slate-100">{item.symbol}</span>
                          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{item.name}</span>
                        </div>
                      </div>
                      <div className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-300 font-mono text-xs font-bold border border-blue-500/20 text-right min-w-[70px]">₺{item.current_price.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* YENİLENMİŞ KURAL ÇEKMECESİ (DRAWER) - DEĞERLER EKLENDİ */}
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
                          {/* SAYISAL DEĞERLER BURAYA EKLENDİ */}
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
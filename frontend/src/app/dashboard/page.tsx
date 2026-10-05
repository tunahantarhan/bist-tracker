'use client';

import { useState, useEffect } from 'react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NotificationBell from '@/components/notifications/NotificationBell';
import StockSearch from '@/components/ui/StockSearch';
import { fetchMarketData, MarketData, fetchWatchlist, addToWatchlist, removeFromWatchlist } from '@/services/api';
import { User, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, XCircle, AlertCircle, Activity, Trash2, LogOut, ShieldCheck, Filter, Calendar } from 'lucide-react';
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

const TICKER_NAMES: Record<string, string> = {
  "THYAO": "Türk Hava Yolları A.O.",
  "KCHOL": "Koç Holding A.Ş.",
  "GARAN": "Garanti BBVA",
  "ASELS": "Aselsan Elektronik",
  "BIMAS": "BİM Birleşik Mağazalar",
  "TUPRS": "Tüpraş",
  "ISCTR": "Türkiye İş Bankası",
  "AKBNK": "Akbank T.A.Ş.",
  "SAHOL": "Sabancı Holding",
  "EREGL": "Erdemir Ereğli Demir Çelik"
};

const CHART_INTERVALS = [
  { value: '5m', label: '5Dk' },
  { value: '15m', label: '15Dk' },
  { value: '1h', label: '1S' },
  { value: '4h', label: '4S' },
  { value: '1d', label: '1G' },
];

// Standard Yahoo Finance periods (2Y instead of non-standard 3Y)
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

  // Combined state prevents double-fetching when interval and period adjust together
  const [chartConfig, setChartConfig] = useState<{ interval: string; period: string }>({
    interval: '4h',
    period: '6mo',
  });

  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [stockScores, setStockScores] = useState<Record<string, number>>({});
  const [loadingMarket, setLoadingMarket] = useState<boolean>(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/auth');
      return;
    }
    
    setIsAuthenticated(true);
    setIsAdmin(localStorage.getItem('is_admin') === 'true');
    loadUserWatchlist();
  }, [router]);

  const loadUserWatchlist = async () => {
    try {
      const data = await fetchWatchlist();
      const symbols = data.map((item: any) => item.symbol);
      setWatchlist(symbols);
      if (symbols.length > 0 && !selectedSymbol) {
        setSelectedSymbol(symbols[0]);
      }
    } catch (err) {
      console.warn('Takip listesi yüklenemedi:', err);
    }
  };

  const handleToggleWatchlist = async (symbol: string, isAdded: boolean) => {
    try {
      if (isAdded) {
        await removeFromWatchlist(symbol);
        const updatedList = watchlist.filter(s => s !== symbol);
        setWatchlist(updatedList);
        
        if (selectedSymbol === symbol) {
          if (updatedList.length > 0) {
            setSelectedSymbol(updatedList[0]);
          } else {
            setSelectedSymbol(null);
            setMarketData(null);
          }
        }
      } else {
        await addToWatchlist(symbol);
        setWatchlist(prev => [...prev, symbol]);
        setSelectedSymbol(symbol);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleIntervalChange = (newInterval: string) => {
    setChartConfig((prev) => {
      let nextPeriod = prev.period;
      if (newInterval === '5m' || newInterval === '15m') {
        nextPeriod = '1mo';
      } else if ((newInterval === '1h' || newInterval === '4h') && prev.period === '5y') {
        nextPeriod = '1y';
      }
      return { interval: newInterval, period: nextPeriod };
    });
  };

  const handlePeriodChange = (newPeriod: string) => {
    setChartConfig((prev) => {
      let nextInterval = prev.interval;
      if (newPeriod === '5y' && prev.interval !== '1d') {
        nextInterval = '1d';
      } else if (newPeriod !== '1mo' && (prev.interval === '5m' || prev.interval === '15m')) {
        nextInterval = '4h';
      }
      return { interval: nextInterval, period: newPeriod };
    });
  };

  useEffect(() => {
    if (!selectedSymbol || !isAuthenticated) return;

    const controller = new AbortController();

    const loadMarket = async () => {
      setLoadingMarket(true);
      try {
        const data = await fetchMarketData(
          selectedSymbol,
          chartConfig.interval,
          chartConfig.period,
          controller.signal
        );
        setMarketData(data);
        if (data.score !== undefined) {
          setStockScores(prev => ({ ...prev, [selectedSymbol]: data.score! }));
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Piyasa verisi çekilirken uyarı:', err?.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingMarket(false);
        }
      }
    };

    loadMarket();
    return () => controller.abort();
  }, [selectedSymbol, chartConfig, isAuthenticated]);

  if (!isAuthenticated) return <div className="min-h-screen bg-[#0b0e14]" />;

  const currentScore = marketData?.score ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e14] text-slate-200">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b0e14]/80 backdrop-blur-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => router.push('/')}>
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-[0_0_12px_#2563eb] transition-transform duration-300 group-hover:scale-105">
              <span className="font-mono text-sm font-black text-white">B</span>
            </div>
            <span className="font-semibold text-slate-100 tracking-tight transition-colors duration-300 group-hover:text-blue-400">
              BIST Tracker
            </span>
          </div>
          
          <StockSearch userWatchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
        </div>

        <div className="flex items-center space-x-4">
          {isAdmin && (
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center space-x-2 rounded-lg bg-emerald-600/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)] hover:bg-emerald-600/25 hover:border-emerald-500/50 hover:text-emerald-300 transition-all duration-200 cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Admin Paneli</span>
            </button>
          )}

          <NotificationBell />
          
          <DropdownMenu>
            <DropdownMenuTrigger className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-700 hover:border-blue-500/50 hover:shadow-[0_0_8px_rgba(37,99,235,0.2)] transition-all duration-300 group outline-none">
              <User className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-slate-800 bg-[#12161f] text-slate-200 p-1.5">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-slate-400 px-2 py-1.5">Hesabım</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-800/80 my-1" />
                
                <DropdownMenuItem 
                  onClick={() => {
                    const slug = localStorage.getItem('user_slug') || 'demo-kullanici';
                    router.push(`/kullanici/${slug}`);
                  }} 
                  className="cursor-pointer py-2 px-2.5 rounded-md text-slate-200 transition-all duration-150"
                >
                  <User className="mr-2 h-4 w-4 text-slate-400" />
                  <span>Profil</span>
                </DropdownMenuItem>

                <DropdownMenuItem 
                  variant="destructive"
                  onClick={() => {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('user_slug');
                    localStorage.removeItem('is_admin');
                    router.push('/auth');
                  }} 
                  className="mt-1 cursor-pointer py-2 px-2.5 rounded-md bg-rose-950/30 text-rose-400 border border-rose-500/10 hover:!bg-rose-900/45 data-[highlighted]:!bg-rose-900/45 data-[highlighted]:!text-rose-200 data-[highlighted]:border-rose-500/30 transition-all duration-200"
                >
                  <LogOut className="mr-2 h-4 w-4 text-rose-400" />
                  <span className="font-medium">Çıkış Yap</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <StockTicker />

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Watchlist */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">Takip Listesi</h2>
              <span className="text-xs font-mono text-slate-500 border border-slate-700 bg-slate-800/50 px-2 py-0.5 rounded-md">
                {watchlist.length} Hisse
              </span>
            </div>

            <div className="w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#12161f]/90 shadow-2xl backdrop-blur-md divide-y divide-slate-800/60 min-h-[200px]">
              {watchlist.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center">
                  <span className="text-3xl mb-3 opacity-20">#</span>
                  <p>Takip listeniz şu an boş.</p>
                  <p className="mt-1 text-xs text-slate-600">Yukarıdaki arama çubuğunu kullanarak hisse ekleyebilirsiniz.</p>
                </div>
              ) : (
                watchlist.map((symbol) => {
                  const isSelected = selectedSymbol === symbol;
                  const symScore = stockScores[symbol];
                  return (
                    <div
                      key={symbol}
                      onClick={() => setSelectedSymbol(symbol)}
                      className={`group flex items-center justify-between px-5 py-4 transition-all duration-150 cursor-pointer ${
                        isSelected ? 'bg-slate-800/40 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-slate-850/50'
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <span className="relative flex h-3 w-3 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                        </span>
                        
                        <div className="flex flex-col items-start justify-center mt-0.5">
                          <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-widest bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 rounded transition-colors group-hover:border-blue-500/30 group-hover:text-blue-400">
                            {symbol}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 mt-1.5 truncate max-w-[130px] group-hover:text-slate-400 transition-colors">
                            {TICKER_NAMES[symbol] || symbol}
                          </span>
                        </div>
                      </div>
                      
                      <div className="relative flex items-center justify-end min-w-[80px]">
                        <div className="text-right transition-all duration-300 transform group-hover:-translate-x-8">
                          <div className="text-sm font-bold font-mono text-emerald-400">
                            {symScore !== undefined ? `${symScore.toFixed(2)}` : '--'}
                          </div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Skor</div>
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleWatchlist(symbol, true);
                          }}
                          className="absolute right-0 p-1.5 rounded-md text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                          title="Listeden Çıkar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Graphic and Dynamic Rule Analysis */}
          <div className="lg:col-span-8 flex flex-col space-y-6">
            <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
              {!selectedSymbol ? (
                <div className="h-[450px] flex flex-col items-center justify-center text-slate-500">
                  <Activity className="h-12 w-12 mb-4 opacity-20" />
                  <p>Grafikleri görüntülemek için listeden bir hisse seçin veya arama çubuğundan ekleyin.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
                    <div>
                      <div className="flex items-center space-x-3">
                        <h3 className="font-mono text-2xl font-bold text-slate-50">{selectedSymbol}</h3>
                        <span className="text-xs font-mono text-blue-400 uppercase tracking-widest bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                          {chartConfig.interval.toUpperCase()} / {chartConfig.period.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-400 mt-1">
                        {selectedSymbol ? TICKER_NAMES[selectedSymbol] || selectedSymbol : ''}
                      </p>
                    </div>

                    {marketData && !loadingMarket ? (
                      <div className="text-right">
                        <div className="font-mono text-2xl font-bold text-slate-100">
                          ₺{marketData.current_price.toFixed(2)}
                        </div>
                        <div className={`flex items-center justify-end space-x-1 font-mono text-xs font-semibold ${
                          marketData.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {marketData.change_pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          <span>{marketData.change_pct >= 0 ? '+' : ''}{marketData.change_pct}%</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-slate-500 flex items-center space-x-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                        <span>Veri çekiliyor...</span>
                      </div>
                    )}
                  </div>

                  {/* Dual Time Controls: Candle Interval (5Dk-1G) & Historical Range (1A, 3A, 6A, 1Y, 2Y, 5Y) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-medium text-slate-400">Mum Periyodu:</span>
                      <div className="flex items-center bg-[#161b26] p-1 rounded-lg border border-slate-800">
                        {CHART_INTERVALS.map((tf) => (
                          <button
                            key={tf.value}
                            type="button"
                            onClick={() => handleIntervalChange(tf.value)}
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all cursor-pointer ${
                              chartConfig.interval === tf.value
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {tf.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-[11px] font-medium text-slate-400">Tarihsel Menzil:</span>
                      <div className="flex items-center bg-[#161b26] p-1 rounded-lg border border-slate-800">
                        {CHART_PERIODS.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => handlePeriodChange(p.value)}
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all cursor-pointer ${
                              chartConfig.period === p.value
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="w-full">
                    {marketData?.candles && !loadingMarket ? (
                      <ChartWrapper
                        candles={marketData.candles}
                        indicators={marketData.indicators}
                        rsiPane={marketData.rsi_pane}
                        height={320}
                      />
                    ) : (
                      <div className="h-[420px] flex items-center justify-center text-slate-600 text-sm">
                        Grafik verisi yükleniyor...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Real Algorithmic Score & Multi-Timeframe Rule Breakdown Card */}
            {selectedSymbol && (
              <div className="rounded-xl border border-slate-800/80 bg-[#12161f]/90 p-6 shadow-2xl backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-200">Algoritmik Güven Skoru</h3>
                    <p className="text-xs text-slate-400 mt-1">Çoklu zaman diliminde tanımlanan teknik kuralların canlı analizi.</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    {marketData?.has_primary_filter && (
                      <div className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center space-x-1.5 ${
                        marketData.primary_filter_passed
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      }`}>
                        <Filter className="h-3.5 w-3.5" />
                        <span>{marketData.primary_filter_passed ? 'Ana Filtreyi Geçti' : 'Ana Filtre Bekleniyor'}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-center px-4 h-14 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono font-bold text-lg">
                      {currentScore.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {!marketData?.rules_breakdown || marketData.rules_breakdown.length === 0 ? (
                    <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/50 text-xs text-slate-500 text-center">
                      Henüz sistemde tanımlı aktif bir algoritmik kural bulunmuyor.
                    </div>
                  ) : (
                    marketData.rules_breakdown.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between p-3.5 rounded-lg bg-slate-800/30 border border-slate-700/50">
                        <div className="flex items-center space-x-3">
                          {rule.is_met ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-slate-600 shrink-0" />
                          )}
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className={`text-sm font-medium ${rule.is_met ? 'text-slate-200' : 'text-slate-500'}`}>
                                {rule.name}
                              </span>
                              {rule.timeframe && (
                                <span className="text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded uppercase">
                                  {rule.timeframe}
                                </span>
                              )}
                              {rule.is_primary_filter && (
                                <span className="text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                  ANA FİLTRE
                                </span>
                              )}
                            </div>
                            {rule.current_value !== undefined && (
                              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                                Güncel: <span className="text-slate-300">{rule.current_value}</span> | Hedef: <span className="text-slate-300">{rule.target_value}</span>
                                {rule.slope !== undefined && rule.slope !== null && (
                                  <span className="ml-2 text-blue-400">(Eğim: {rule.slope} | Tepe RSI: {rule.peak_rsi})</span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`text-xs font-mono font-semibold ${rule.is_met ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {rule.is_met ? `+${rule.earned_score.toFixed(2)} Puan` : '0.00 Puan'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer - Legal Warning */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#0b0e14] py-6 px-8">
        <div className="max-w-7xl mx-auto flex items-start space-x-3 text-slate-500">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500/70" />
          <p className="text-xs leading-relaxed">
            <strong className="text-slate-400 font-semibold">Yasal Uyarı: </strong> 
            Burada yer alan gösterge, analiz ve algoritmik skorlar kesinlikle yatırım danışmanlığı kapsamında değildir. 
            Sistem sadece önceden tanımlanmış matematiksel koşulları izleyen tarafsız bir kural motorudur. 
            Buradaki verilere dayanarak alım-satım kararı verilmesi beklentilerinize uygun sonuçlar doğurmayabilir.
          </p>
        </div>
      </footer>
    </div>
  );
}
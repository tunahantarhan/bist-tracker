'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
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
import StockTicker from '@/components/ui/StockTicker';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import MarketPulse from '@/components/dashboard/MarketPulse';
import { PrimaryFilterPanel, WatchlistPanel } from '@/components/dashboard/SymbolLists';
import InstrumentPanel, { type ChartConfig } from '@/components/dashboard/InstrumentPanel';
import { MoversPanel, TopScoredPanel } from '@/components/dashboard/RankedPanels';
import RuleDrawer from '@/components/dashboard/RuleDrawer';
import AppFooter from '@/components/dashboard/AppFooter';
import { getAccessToken } from '@/lib/auth';

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

export default function DashboardPage() {
  const router = useRouter();
  const isAuthenticated = useSyncExternalStore(noopSubscribe, () => !!getAccessToken(), () => false);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  // Pending state drives the UI; the ref is the real mutex (state updates are async, so two quick clicks could both pass a state check)
  const [watchlistPending, setWatchlistPending] = useState<Record<string, boolean>>({});
  const watchlistInFlightRef = useRef<Set<string>>(new Set());

  // ?sembol=THYAO opens the dashboard with that stock selected (deep links, notifications)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromUrl = new URLSearchParams(window.location.search).get('sembol')?.toUpperCase() ?? '';
    return /^[A-Z0-9]{2,10}$/.test(fromUrl) ? fromUrl : null;
  });
  const selectedSymbolRef = useRef<string | null>(null);

  const chartSectionRef = useRef<HTMLDivElement>(null);
  // Last payload per symbol/interval/period so switching back renders instantly
  const chartCacheRef = useRef<Record<string, MarketData>>({});

  // Below lg only one side list is shown at a time so the chart stays near the top
  const [mobileListTab, setMobileListTab] = useState<'watchlist' | 'rsi'>('watchlist');
  const [isRuleDrawerOpen, setIsRuleDrawerOpen] = useState(false);

  const [chartConfig, setChartConfig] = useState<ChartConfig>(getDefaultChartConfig('4h'));
  const chartConfigRef = useRef<ChartConfig>(chartConfig);
  // The chart defaults follow the primary filter timeframe until the user picks something
  const chartConfigTouchedRef = useRef(false);

  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(false);

  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [liveTickerData, setLiveTickerData] = useState<TickerItem[]>([]);

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
    chartConfigRef.current = chartConfig;
  }, [selectedSymbol, chartConfig]);

  const loadingOverview = overview === null;
  const activePrimaryFilterTf = marketData?.primary_filter_timeframe || overview?.primary_filter_timeframe || '4h';

  // Overview row per symbol (score, name, price, change)
  const itemsBySymbol = useMemo(() => {
    const map: Record<string, StockOverviewItem> = {};
    overview?.items.forEach((item) => {
      map[item.symbol] = item;
    });
    return map;
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

  const closeRuleDrawer = useCallback(() => setIsRuleDrawerOpen(false), []);

  const selectedData = marketData && marketData.symbol === selectedSymbol ? marketData : null;
  const currentScore = selectedData?.score ?? (selectedSymbol ? itemsBySymbol[selectedSymbol]?.score ?? 0 : 0);

  if (!isAuthenticated) return <div className="min-h-screen bg-[#0b0e14]" />;

  const rsiPassedList: StockOverviewItem[] = overview?.rsi_passed || [];
  const topScoredList: StockOverviewItem[] = overview?.top_scored || [];

  // Empty-state shortcuts: the user's own list first, otherwise the current leaders
  const quickPicks = (watchlist.length ? watchlist : topScoredList.map((i) => i.symbol))
    .slice(0, 5)
    .map((symbol) => ({ symbol, score: itemsBySymbol[symbol]?.score }));

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#0b0e14] text-slate-200">
      <DashboardHeader watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} onSelect={handleSelectStockWithScroll} />
      <StockTicker items={liveTickerData} />

      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-5 p-4 md:p-6">
        <MarketPulse overview={overview} />

        <div className="flex flex-col items-start gap-5 lg:flex-row">
          <aside className="w-full shrink-0 space-y-4 lg:w-80">
            {/* Mobile list switcher */}
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800/80 bg-[#12161f] p-1 lg:hidden">
              {(
                [
                  { key: 'watchlist', label: 'Takip listem', count: watchlist.length, active: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
                  { key: 'rsi', label: 'Ana filtre', count: rsiPassedList.length, active: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={mobileListTab === tab.key}
                  onClick={() => setMobileListTab(tab.key)}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-colors ${
                    mobileListTab === tab.key ? tab.active : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                  <span className="rounded-md bg-slate-800/70 px-1.5 py-0.5 font-data text-[10px]">{tab.count}</span>
                </button>
              ))}
            </div>

            <WatchlistPanel
              className={mobileListTab === 'watchlist' ? '' : 'hidden lg:block'}
              watchlist={watchlist}
              items={itemsBySymbol}
              selectedSymbol={selectedSymbol}
              pending={watchlistPending}
              onSelect={handleSelectStockWithScroll}
              onRemove={(symbol) => handleToggleWatchlist(symbol, true)}
            />
            <PrimaryFilterPanel
              className={mobileListTab === 'rsi' ? '' : 'hidden lg:block'}
              items={rsiPassedList}
              loading={loadingOverview}
              timeframe={activePrimaryFilterTf}
              selectedSymbol={selectedSymbol}
              onSelect={handleSelectRsiStockWithScroll}
            />
          </aside>

          <div className="w-full min-w-0 flex-1 space-y-5">
            <div ref={chartSectionRef} className="scroll-mt-20">
              <InstrumentPanel
                symbol={selectedSymbol}
                name={selectedData?.name || (selectedSymbol ? itemsBySymbol[selectedSymbol]?.name : undefined)}
                data={selectedData}
                loading={loadingMarket}
                score={currentScore}
                primaryTf={activePrimaryFilterTf}
                chartConfig={chartConfig}
                onIntervalChange={handleIntervalChange}
                onPeriodChange={handlePeriodChange}
                watched={!!selectedSymbol && watchlist.includes(selectedSymbol)}
                watchPending={!!selectedSymbol && !!watchlistPending[selectedSymbol]}
                onToggleWatch={() => selectedSymbol && handleToggleWatchlist(selectedSymbol, watchlist.includes(selectedSymbol))}
                onOpenRules={() => setIsRuleDrawerOpen(true)}
                quickPicks={quickPicks}
                onSelect={handleSelectStockWithScroll}
              />
            </div>

            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
              <TopScoredPanel items={topScoredList} loading={loadingOverview} selectedSymbol={selectedSymbol} onSelect={handleSelectStockWithScroll} />
              <MoversPanel items={overview?.items ?? []} loading={loadingOverview} selectedSymbol={selectedSymbol} onSelect={handleSelectStockWithScroll} />
            </div>
          </div>
        </div>
      </main>

      <AppFooter />

      <RuleDrawer
        open={isRuleDrawerOpen}
        symbol={selectedSymbol}
        name={selectedData?.name || (selectedSymbol ? itemsBySymbol[selectedSymbol]?.name : undefined)}
        score={currentScore}
        rules={selectedData?.rules_breakdown ?? []}
        onClose={closeRuleDrawer}
      />
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Bookmark, BookmarkCheck, ChevronRight, Filter, LayoutDashboard, Loader2, SearchX, ShieldCheck } from 'lucide-react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import StockAlertDropdown from '@/components/alerts/StockAlertDropdown';
import ScoreGauge, { getScoreTier } from '@/components/ui/ScoreGauge';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import AppFooter from '@/components/dashboard/AppFooter';
import RuleRow from '@/components/dashboard/RuleRow';
import { Segmented } from '@/components/dashboard/InstrumentPanel';
import { Eyebrow, Panel, PanelHeader, formatPct, formatPrice } from '@/components/dashboard/Panel';
import { FundamentalsPanel, ReturnsStrip, RsiSnapshot, ScoreComposition, YearRange } from '@/components/detail/DetailBlocks';
import { addToWatchlist, fetchMarketData, fetchWatchlist, removeFromWatchlist, type MarketData } from '@/services/api';
import { useValueFlash } from '@/hooks/useValueFlash';
import { tfLabel } from '@/lib/timeframes';

// Each candle size comes with a sensible history length
const TIMEFRAMES = [
  { value: '5m', label: '5Dk', period: '1mo' },
  { value: '15m', label: '15Dk', period: '1mo' },
  { value: '1h', label: '1S', period: '3mo' },
  { value: '4h', label: '4S', period: '6mo' },
  { value: '1d', label: '1G', period: '1y' },
];

const CHART_HEIGHT = 420;

function Skeleton() {
  return (
    <div className="space-y-5">
      <div className="h-[220px] animate-pulse rounded-2xl border border-slate-800/80 bg-[#12161f]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-2xl border border-slate-800/80 bg-[#12161f]" />
        ))}
      </div>
      <div className="flex h-[560px] items-center justify-center gap-2 rounded-2xl border border-slate-800/80 bg-[#12161f] font-data text-xs text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> Veriler hazırlanıyor
      </div>
    </div>
  );
}

function NotFound({ symbol }: { symbol: string }) {
  return (
    <Panel>
      <div className="flex min-h-[460px] flex-col items-center justify-center p-8 text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10">
          <SearchX className="h-7 w-7 text-rose-400" />
        </span>
        <Eyebrow className="text-slate-500">{symbol}</Eyebrow>
        <h1 className="mt-2 text-2xl font-bold text-slate-100">Bu sembol için veri bulunamadı</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
          Kod hatalı olabilir ya da hisse taranan evrende değildir. Üstteki aramadan başka bir hisse seçebilirsiniz.
        </p>
        <Link
          href="/ana-sayfa"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <LayoutDashboard className="h-4 w-4" /> Panele dön
        </Link>
      </div>
    </Panel>
  );
}

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = ((params?.symbol as string) || '').toUpperCase();

  const [timeframe, setTimeframe] = useState('1h');
  const [rawData, setData] = useState<MarketData | null>(null);
  // Ignore a payload left over from the previously viewed symbol
  const data = rawData && rawData.symbol === symbol ? rawData : null;
  // `loading` lasts until the first response for the current symbol + timeframe
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== `${symbol}_${timeframe}`;

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchPending, setWatchPending] = useState(false);
  const watchInFlight = useRef(false);

  useEffect(() => {
    fetchWatchlist()
      .then((items) => setWatchlist(items.map((i) => i.symbol)))
      .catch(() => {});
  }, []);

  // Fetch on timeframe change and keep refreshing every 15s
  useEffect(() => {
    if (!symbol) return;
    const option = TIMEFRAMES.find((t) => t.value === timeframe) ?? TIMEFRAMES[2];
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetchMarketData(symbol, option.value, option.period);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('Hisse detay yükleme hatası:', err);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoadedKey(`${symbol}_${timeframe}`);
      }
    };

    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, timeframe]);

  const toggleWatch = useCallback(
    async (target: string, isAdded: boolean) => {
      if (watchInFlight.current) return;
      watchInFlight.current = true;
      setWatchPending(true);
      try {
        if (isAdded) {
          await removeFromWatchlist(target);
          setWatchlist((prev) => prev.filter((s) => s !== target));
        } else {
          await addToWatchlist(target);
          setWatchlist((prev) => (prev.includes(target) ? prev : [...prev, target]));
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'İşlem başarısız oldu');
      } finally {
        watchInFlight.current = false;
        setWatchPending(false);
      }
    },
    []
  );

  const handleBack = () => {
    if (window.history.length > 1 && document.referrer.includes(window.location.host)) router.back();
    else router.push('/ana-sayfa');
  };

  const priceFlash = useValueFlash(symbol, data?.current_price);
  const hasData = !!data && data.candles?.length > 0;
  const rules = data?.rules_breakdown ?? [];
  const metCount = rules.filter((r) => r.is_met).length;
  const score = data?.score ?? 0;
  const tier = getScoreTier(score);
  const watched = watchlist.includes(symbol);
  const up = (data?.change_pct ?? 0) >= 0;
  const primaryTf = data?.primary_filter_timeframe ?? '4h';

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#0b0e14] text-slate-200">
      <DashboardHeader watchlist={watchlist} onToggleWatchlist={toggleWatch} onSelect={(s) => router.push(`/detay/${s}`)} />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 md:px-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-3" aria-label="Konum">
          <button
            type="button"
            onClick={handleBack}
            title="Geri dön"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Link href="/ana-sayfa" className="font-data text-xs text-slate-500 transition-colors hover:text-blue-300">
            Panel
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-700" />
          <span className="font-data text-xs text-slate-200">{symbol}</span>
        </nav>

        {loading && !data ? (
          <Skeleton />
        ) : !hasData ? (
          <NotFound symbol={symbol} />
        ) : (
          <>
            {/* Hero */}
            <Panel className="relative">
              <div
                className="pointer-events-none absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgb(30 41 59 / 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgb(30 41 59 / 0.45) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                  maskImage: 'radial-gradient(ellipse 60% 90% at 0% 0%, black 20%, transparent 70%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 60% 90% at 0% 0%, black 20%, transparent 70%)',
                }}
              />
              <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className="min-w-0 space-y-4">
                  <Eyebrow className="text-blue-400">Borsa İstanbul · Hisse detayı</Eyebrow>
                  <div>
                    <h1 className="font-data text-4xl font-bold tracking-tight text-white sm:text-5xl">{symbol}</h1>
                    <p className="mt-1.5 text-sm text-slate-400">{data!.name && data!.name !== symbol ? data!.name : `${symbol} pay senedi`}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {data!.has_primary_filter && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-data text-[10px] uppercase tracking-wider ${
                          data!.primary_filter_passed
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-700 bg-slate-800/50 text-slate-400'
                        }`}
                      >
                        <Filter className="h-3 w-3" />
                        {data!.primary_filter_passed ? 'Ana filtre geçti' : 'Ana filtre bekleniyor'} · {tfLabel(primaryTf)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/50 px-2 py-1 font-data text-[10px] uppercase tracking-wider text-slate-400">
                      <ShieldCheck className="h-3 w-3" /> {metCount}/{rules.length} kural
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={watchPending}
                      onClick={() => toggleWatch(symbol, watched)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        watched
                          ? 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                          : 'border-slate-700 bg-[#161b26] text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {watchPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : watched ? (
                        <BookmarkCheck className="h-3.5 w-3.5" />
                      ) : (
                        <Bookmark className="h-3.5 w-3.5" />
                      )}
                      {watched ? 'Takipte' : 'Takibe al'}
                    </button>
                    <StockAlertDropdown symbol={symbol} />
                    <Link
                      href={`/ana-sayfa?sembol=${symbol}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#161b26] px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5" /> Panelde aç
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:flex sm:items-stretch">
                  <div
                    className={`flex min-w-0 flex-col justify-center rounded-xl border border-slate-800/80 px-5 py-4 transition-colors duration-500 sm:min-w-[190px] ${
                      priceFlash === 'up' ? 'bg-emerald-500/10' : priceFlash === 'down' ? 'bg-rose-500/10' : 'bg-[#0d1118]'
                    }`}
                  >
                    <Eyebrow className="text-slate-500">Son fiyat</Eyebrow>
                    <span className="mt-2 font-data text-3xl font-semibold text-slate-50">₺{formatPrice(data!.current_price)}</span>
                    <span className={`mt-1 font-data text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {up ? '▲' : '▼'} {formatPct(data!.change_pct)} <span className="text-slate-600">bugün</span>
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-4 rounded-xl border border-slate-800/80 bg-[#0d1118] px-4 py-3">
                    <ScoreGauge score={score} size="lg" />
                    <div className="hidden min-w-0 sm:block">
                      <Eyebrow className="text-slate-500">Güven skoru</Eyebrow>
                      <p className="mt-1.5 font-data text-sm font-semibold" style={{ color: tier.color }}>
                        {tier.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">100 üzerinden</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative grid gap-6 border-t border-slate-800/80 p-5 sm:p-6 md:grid-cols-2">
                <YearRange low={data!.fundamentals?.year_low} high={data!.fundamentals?.year_high} price={data!.current_price} />
                <div className="space-y-2">
                  <Eyebrow className="text-slate-500">Skor bileşimi</Eyebrow>
                  <ScoreComposition rules={rules} />
                </div>
              </div>
            </Panel>

            <ReturnsStrip items={data!.periodic_returns ?? []} />

            {/* Chart */}
            <Panel>
              <div className="flex flex-col gap-3 border-b border-slate-800/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <Eyebrow className="text-slate-300">Fiyat ve RSI</Eyebrow>
                  <p className="mt-0.5 text-[11px] text-slate-500">Mum boyutu değişince geçmiş uzunluğu otomatik ayarlanır</p>
                </div>
                <div className="sm:w-80">
                  <Segmented label="Mum" options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
                </div>
              </div>
              <div className="px-2 pb-2 pt-3 sm:px-3">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 font-data text-xs text-slate-600" style={{ height: CHART_HEIGHT }}>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> Grafik hazırlanıyor
                  </div>
                ) : (
                  <ChartWrapper
                    key={`${symbol}-${timeframe}`}
                    candles={data!.candles}
                    indicators={data!.indicators}
                    rsiPane={data!.rsi_pane}
                    height={CHART_HEIGHT}
                  />
                )}
              </div>
            </Panel>

            <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
              <Panel>
                <PanelHeader
                  icon={ShieldCheck}
                  title="Kural karnesi"
                  subtitle="Her kural kendi zaman diliminde değerlendirilir"
                  accent="emerald"
                  right={<span className="font-data text-xs text-slate-400">{metCount}/{rules.length}</span>}
                />
                {rules.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">Aktif kural bulunmuyor.</p>
                ) : (
                  <ul className="space-y-2 p-4">
                    {rules.map((rule) => (
                      <RuleRow key={rule.id} rule={rule} />
                    ))}
                  </ul>
                )}
                <p className="border-t border-slate-800/80 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
                  Skor, sağlanan kuralların ağırlıklarının toplamıdır ve grafikte seçilen mum boyutundan bağımsızdır.
                </p>
              </Panel>

              <div className="space-y-5">
                <RsiSnapshot data={data!} interval={timeframe} />
                <FundamentalsPanel data={data!} />
              </div>
            </div>
          </>
        )}
      </main>

      <AppFooter />
    </div>
  );
}

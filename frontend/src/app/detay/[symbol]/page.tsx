'use client';

import { BRAND } from '@/lib/brand';
import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, CheckCircle2, XCircle, 
  TrendingUp, TrendingDown, ShieldCheck, ChevronRight,
  PieChart
} from 'lucide-react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import StockAlertDropdown from '@/components/alerts/StockAlertDropdown';
import ScoreGauge from '@/components/ui/ScoreGauge';
import { fetchMarketData, MarketData, PeriodicReturnItem } from '@/services/api';
import RuleConditionText from '@/components/rules/RuleConditionText';
import { tfLabel } from '@/lib/timeframes';

type StockDetailData = MarketData;

const BIST_COMPANY_NAMES: Record<string, string> = {
  KORDS: "Kordsa Teknik Tekstil A.Ş.",
  AYDEM: "Aydem Yenilenebilir Enerji A.Ş.",
  VESTL: "Vestel Elektronik Sanayi ve Ticaret A.Ş.",
  THYAO: "Türk Hava Yolları A.O.",
  ASELS: "Aselsan Elektronik Sanayi ve Ticaret A.Ş.",
  GARAN: "Türkiye Garanti Bankası A.Ş.",
  AKBNK: "Akbank T.A.Ş.",
  YKBNK: "Yapı ve Kredi Bankası A.Ş.",
  ISCTR: "Türkiye İş Bankası A.Ş. (C)",
  KCHOL: "Koç Holding A.Ş.",
  SAHOL: "Hacı Ömer Sabancı Holding A.Ş.",
  TUPRS: "Tüpraş Türkiye Petrol Rafinerileri A.Ş.",
  EREGL: "Ereğli Demir ve Çelik Fabrikaları T.A.Ş.",
  SISE: "Türkiye Şişe ve Cam Fabrikaları A.Ş.",
  BIMAS: "BİM Birleşik Mağazalar A.Ş.",
  FROTO: "Ford Otomotiv Sanayi A.Ş.",
  TOASO: "Tofaş Türk Otomobil Fabrikası A.Ş.",
  TTKOM: "Türk Telekomünikasyon A.Ş.",
  TCELL: "Turkcell İletişim Hizmetleri A.Ş.",
  PETKM: "Petkim Petrokimya Holding A.Ş.",
  PGSUS: "Pegasus Hava Taşımacılığı A.Ş.",
  KOZAL: "Koza Altın İşletmeleri A.Ş.",
  EKGYO: "Emlak Konut Gayrimenkul Yatırım Ortaklığı A.Ş.",
  ASTOR: "Astor Enerji A.Ş.",
  KONTR: "Kontrolmatik Teknoloji Enerji ve Mühendislik A.Ş.",
  HEKTS: "Hektaş Ticaret T.A.Ş.",
  SASA: "SASA Polyester Sanayi A.Ş.",
  MIATK: "Mia Teknoloji A.Ş.",
  RTALB: "RTA Laboratuvarları Biyolojik Ürünler İlaç San. A.Ş.",
  SKBNK: "Şekerbank T.A.Ş.",
  ODAS: "Odaş Elektrik Üretim Sanayi Ticaret A.Ş.",
  ALARK: "Alarko Holding A.Ş.",
  TATGD: "Tat Gıda Sanayi A.Ş.",
  ULKER: "Ülker Bisküvi Sanayi A.Ş.",
  GOODY: "Goodyear Lastikleri T.A.Ş.",
  KARSN: "Karsan Otomotiv Sanayii ve Ticaret A.Ş.",
};

const TIMEFRAME_OPTIONS = [
  { label: '5 DK', value: '5m', period: '1mo' },
  { label: '15 DK', value: '15m', period: '1mo' },
  { label: '1 S', value: '1h', period: '3mo' },
  { label: '4 S', value: '4h', period: '6mo' },
  { label: '1 G', value: '1d', period: '1y' },
];

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params?.symbol as string)?.toUpperCase() || '';

  const [timeframe, setTimeframe] = useState<string>('15m');
  const [data, setData] = useState<StockDetailData | null>(null);

  const handleSmartBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer.includes(window.location.host)) {
      router.back();
    } else {
      router.push('/ana-sayfa');
    }
  };

  const companyTitle = useMemo(() => {
    if (data?.name && data.name !== symbol) return data.name;
    if (BIST_COMPANY_NAMES[symbol]) return BIST_COMPANY_NAMES[symbol];
    return `${symbol} Pay Piyasası`;
  }, [data, symbol]);

  // Fetch on timeframe change and keep refreshing every 15s; `loading` lasts until the first response for this timeframe
  const [loadedTimeframe, setLoadedTimeframe] = useState<string | null>(null);
  const loading = loadedTimeframe !== timeframe;

  useEffect(() => {
    if (!symbol) return;
    const option = TIMEFRAME_OPTIONS.find((opt) => opt.value === timeframe) || TIMEFRAME_OPTIONS[1];
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetchMarketData(symbol, option.value, option.period);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('Hisse detay yükleme hatası:', err);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoadedTimeframe(timeframe);
      }
    };

    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, timeframe]);

  const periodicReturns: PeriodicReturnItem[] = data?.periodic_returns ?? [];

  const formatLargeCurrency = (val?: number | null) => {
    if (!val || val === 0) return '---';
    if (val >= 1_000_000_000) return `₺${(val / 1_000_000_000).toFixed(2)} Mr`;
    if (val >= 1_000_000) return `₺${(val / 1_000_000).toFixed(2)} Mn`;
    return `₺${val.toLocaleString('tr-TR')}`;
  };

  const hasValidData = data && data.candles && data.candles.length > 0;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="px-4 sm:px-8 py-3.5 border-b border-slate-800/80 bg-[#12161f]/80 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            type="button"
            onClick={handleSmartBack}
            className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Geri Dön"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center space-x-2">
            <Link href="/ana-sayfa" className="text-xs font-mono text-slate-400 hover:text-blue-400 transition-colors">
              Panel
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            <span className="font-mono font-bold text-sm text-slate-100">{symbol}</span>
          </div>
        </div>

        <StockAlertDropdown symbol={symbol} />
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        
        {/* Loading State */}
        {loading && (
          <div className="min-h-[460px] flex items-center justify-center border border-dashed border-slate-800/80 rounded-2xl bg-[#12161f]/30 text-xs font-mono text-slate-400">
            {symbol} detay verileri yükleniyor...
          </div>
        )}

        {/* 404 Empty State for Unknown or Inactive Symbol */}
        {!loading && !hasValidData && (
          <div className="min-h-[460px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800/80 rounded-2xl bg-[#12161f]/30">
            <div className="h-14 w-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
              <XCircle className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 tracking-tight">
              {symbol} Sembolü Bulunamadı
            </h3>
            <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
              Borsa İstanbul evreninde bu koda ait aktif piyasa verisi veya kural karnesi tespit edilemedi.
            </p>
            <button
              onClick={() => router.push('/ana-sayfa')}
              className="mt-5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              Ana Panele Geri Dön
            </button>
          </div>
        )}

        {/* Full Details Content (Rendered when valid data exists) */}
        {!loading && hasValidData && (
          <>
            {/* Header Summary Hero Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#12161f]/60 border border-slate-800/80 shadow-xl backdrop-blur-sm">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-mono font-bold text-blue-400 text-base shrink-0">
                  {symbol.slice(0, 3)}
                </div>
                <div>
                  <div className="flex items-center space-x-2.5">
                    <h1 className="text-2xl font-black font-mono tracking-tight text-white">{symbol}</h1>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                      data.primary_filter_passed 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {data.primary_filter_passed ? 'FİLTRE ONAYLANDI' : 'FİLTRE BEKLENİYOR'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-medium truncate max-w-[280px] sm:max-w-md">
                    {companyTitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-6 shrink-0">
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-white">
                    ₺{data.current_price.toFixed(2)}
                  </div>
                  <div className={`text-xs font-mono font-semibold flex items-center justify-end space-x-1 ${
                    data.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {data.change_pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    <span>{data.change_pct >= 0 ? '+' : ''}{data.change_pct.toFixed(2)}%</span>
                  </div>
                </div>

                <div className="h-10 w-px bg-slate-800 hidden sm:block" />

                {/* Circular Speedometer Score Gauge */}
                <div className="flex items-center space-x-3">
                  <ScoreGauge score={data.score} size="md" showDecimals={true} />
                  <div className="hidden sm:flex flex-col text-left">
                    <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                      Kural Skoru
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      / 100 Puan
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 1st SECTION: Periodic Returns Strip (1H, 1A, 3A, 6A, 1Y) */}
            {periodicReturns.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 select-none">
                {periodicReturns.map((item) => {
                  const isPositive = item.change_pct >= 0;
                  return (
                    <div
                      key={item.period}
                      className="flex flex-col p-3 rounded-xl border border-slate-800/80 bg-[#12161f]/40 hover:border-slate-700/80 transition-all"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                        <span>{item.label}</span>
                        <span className="text-[10px] font-mono text-slate-500">{item.period}</span>
                      </div>
                      <div className="mt-1 flex items-center space-x-1 font-mono text-base font-bold">
                        <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                          {isPositive ? '+' : ''}{item.change_pct.toFixed(2)}%
                        </span>
                        {isPositive ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Timeframe Selection Bar */}
            <div className="flex items-center space-x-1 bg-[#12161f] p-1 rounded-xl border border-slate-800/80 w-fit">
              {TIMEFRAME_OPTIONS.map((opt) => {
                const isSelected = timeframe === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTimeframe(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Interactive Chart Container */}
            <div className="p-4 rounded-2xl bg-[#12161f]/60 border border-slate-800/80">
              <ChartWrapper
                candles={data.candles}
                indicators={data.indicators}
                rsiPane={data.rsi_pane}
                height={380}
              />
            </div>

            {/* 2nd SECTION: Key Fundamental Ratios Grid */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
                <PieChart className="h-4 w-4 text-amber-400" />
                <span>Temel Borsa Rasyoları & Finansal Göstergeler</span>
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Market Value */}
                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#12161f]/50 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-slate-400">Piyasa Değeri</span>
                  <div className="text-base sm:text-lg font-bold font-mono text-slate-100 mt-1">
                    {formatLargeCurrency(data.fundamentals?.market_cap)}
                  </div>
                </div>

                {/* Free-Float Ratio */}
                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#12161f]/50 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-slate-400">Fiili Dolaşım (Halka Açıklık)</span>
                  <div className="text-base sm:text-lg font-bold font-mono text-cyan-400 mt-1">
                    {data.fundamentals?.free_float_pct !== undefined && data.fundamentals?.free_float_pct !== null
                      ? `%${data.fundamentals.free_float_pct.toFixed(2)}`
                      : '---'}
                  </div>
                </div>

                {/* P/E (F/K) Ratio */}
                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#12161f]/50 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-slate-400">F/K (Fiyat / Kazanç)</span>
                  <div className="text-base sm:text-lg font-bold font-mono text-amber-300 mt-1">
                    {data.fundamentals?.pe_ratio !== undefined && data.fundamentals?.pe_ratio !== null
                      ? data.fundamentals.pe_ratio.toFixed(2)
                      : '---'}
                  </div>
                </div>

                {/* P/B (PD/DD) Ratio */}
                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#12161f]/50 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-slate-400">PD / DD (Piyasa / Defter Değeri)</span>
                  <div className="text-base sm:text-lg font-bold font-mono text-purple-300 mt-1">
                    {data.fundamentals?.pb_ratio !== undefined && data.fundamentals?.pb_ratio !== null
                      ? data.fundamentals.pb_ratio.toFixed(2)
                      : '---'}
                  </div>
                </div>
              </div>
            </div>

            {/* 3rd SECTION: Rule Analysis Report */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                <span>Kural Analiz Karnesi ({symbol})</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.rules_breakdown?.map((rule) => {
                  const isMet = rule.is_met;
                  const scoreVal = isMet ? (rule.earned_score ?? rule.score_impact ?? 0) : 0;

                  return (
                    <div
                      key={rule.id}
                      className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
                        isMet
                          ? 'bg-emerald-950/15 border-emerald-500/30'
                          : 'bg-[#12161f]/40 border-slate-800/80'
                      }`}
                    >
                      <div className="space-y-1.5 pr-3 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-slate-200 truncate">{rule.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                            {tfLabel(rule.timeframe)}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          <RuleConditionText rule={rule} />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 ml-2">
                        <span className={`text-xs font-mono font-bold ${isMet ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {isMet ? `+${scoreVal}p` : '0.00'}
                        </span>
                        {isMet ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-slate-600" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Legal Disclaimer Footer */}
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
            © {new Date().getFullYear()} {BRAND.name}. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>
    </div>
  );
}
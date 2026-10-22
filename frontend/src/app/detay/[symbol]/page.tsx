'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, CheckCircle2, XCircle, 
  TrendingUp, TrendingDown, ShieldCheck, ChevronRight 
} from 'lucide-react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import StockAlertDropdown from '@/components/alerts/StockAlertDropdown';
import ScoreGauge from '@/components/ui/ScoreGauge';
import { API_URL } from '@/services/api';

interface RuleBreakdownItem {
  id: number;
  name: string;
  timeframe: string;
  is_primary_filter?: boolean;
  score_impact?: number;
  earned_score?: number;
  is_met?: boolean;
  passed?: boolean;
  current_value?: number | null;
  target_value?: number | null;
  left_value?: number | null;
  right_value?: number | null;
  condition?: string;
}

interface StockDetailData {
  symbol: string;
  name?: string;
  interval: string;
  current_price: number;
  change_pct: number;
  candles: any[];
  score: number;
  primary_filter_passed: boolean;
  primary_filter_timeframe: string;
  rules_breakdown: RuleBreakdownItem[];
  indicators: any[];
  rsiPane: any;
}

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

// Helper function to render human-readable condition text and reference values
function renderConditionText(rule: RuleBreakdownItem) {
  const curVal = rule.current_value ?? rule.left_value;
  const targetVal = rule.target_value ?? rule.right_value;
  const formattedCur = curVal !== undefined && curVal !== null ? Number(curVal).toFixed(2) : null;
  const formattedTarget = targetVal !== undefined && targetVal !== null ? Number(targetVal).toFixed(2) : null;
  const cond = rule.condition || '>';

  // 1. If rule is an RSI range (e.g. RSI 0-30)
  if (rule.name?.includes('(0-30)') || rule.name?.toLowerCase().includes('aşırı satım')) {
    if (formattedCur !== null) {
      return (
        <span>
          Anlık RSI: <strong className="text-slate-200">{formattedCur}</strong>{' '}
          <span className="text-slate-500">| Hedef Aralık:</span>{' '}
          <strong className="text-amber-400">[0 - 30]</strong>
        </span>
      );
    }
  }

  // 2. Standard comparison rule (e.g. MA(9) > MA(14))
  if (formattedCur !== null && formattedTarget !== null) {
    return (
      <span>
        Anlık: <strong className="text-slate-200">{formattedCur}</strong>{' '}
        <span className="text-slate-500">{cond}</span>{' '}
        Referans: <strong className="text-slate-200">{formattedTarget}</strong>
      </span>
    );
  }

  return <span className="text-slate-500">Şart durumu izleniyor</span>;
}

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params?.symbol as string)?.toUpperCase() || '';

  const [timeframe, setTimeframe] = useState<string>('15m');
  const [data, setData] = useState<StockDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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

  const fetchStockData = useCallback(async (selectedTf: string) => {
    if (!symbol) return;
    try {
      const activeOption = TIMEFRAME_OPTIONS.find((opt) => opt.value === selectedTf) || TIMEFRAME_OPTIONS[1];
      const res = await fetch(`${API_URL}/market/${symbol}?interval=${activeOption.value}&period=${activeOption.period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Hisse detay yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    fetchStockData(timeframe);
  }, [timeframe, fetchStockData]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchStockData(timeframe);
    }, 15000);
    return () => clearInterval(timer);
  }, [timeframe, fetchStockData]);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col">
      {/* Top Navigation Bar with sticky blur */}
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

        {/* Custom Rule-Specific Alert Dropdown */}
        <StockAlertDropdown symbol={symbol} />
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#12161f]/60 border border-slate-800/80">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-mono font-bold text-blue-400 text-base shrink-0">
              {symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-2xl font-black font-mono tracking-tight text-white">{symbol}</h1>
                <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                  data?.primary_filter_passed 
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {data?.primary_filter_passed ? 'FİLTRE ONAYLANDI' : 'FİLTRE BEKLENİYOR'}
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
                ₺{data?.current_price?.toFixed(2) ?? '---'}
              </div>
              <div className={`text-xs font-mono font-semibold flex items-center justify-end space-x-1 ${
                (data?.change_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {(data?.change_pct ?? 0) >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                <span>{(data?.change_pct ?? 0) >= 0 ? '+' : ''}{data?.change_pct?.toFixed(2)}%</span>
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800 hidden sm:block" />

            {/* Circular Speedometer Gauge for Stock Detail Header */}
            <div className="flex items-center space-x-3">
              <ScoreGauge score={data?.score} size="md" showDecimals={true} />
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

        {/* Timeframe Selection */}
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

        {/* Chart View */}
        <div className="p-4 rounded-2xl bg-[#12161f]/60 border border-slate-800/80">
          {loading ? (
            <div className="h-[480px] flex items-center justify-center text-xs font-mono text-slate-500">
              Grafik ve teknik veriler yükleniyor...
            </div>
          ) : data?.candles && data.candles.length > 0 ? (
            <ChartWrapper
              candles={data.candles}
              indicators={data.indicators}
              rsiPane={data.rsiPane}
              height={360}
            />
          ) : (
            <div className="h-[480px] flex items-center justify-center text-xs font-mono text-slate-500">
              Bu periyotta gösterilecek mum verisi bulunamadı.
            </div>
          )}
        </div>

        {/* Rule Analysis Report - Fully Aligned with Backend Response */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            <span>Kural Analiz Karnesi ({symbol})</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data?.rules_breakdown?.map((rule) => {
              const isMet = rule.is_met ?? rule.passed ?? false;
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
                        {rule.timeframe?.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {renderConditionText(rule)}
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
      </main>
    </div>
  );
}
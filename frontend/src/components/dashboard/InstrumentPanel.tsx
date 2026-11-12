'use client';

import { ArrowUpRight, Bookmark, BookmarkCheck, Check, ChevronRight, Filter, Loader2, X } from 'lucide-react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import StockAlertDropdown from '@/components/alerts/StockAlertDropdown';
import ScoreGauge, { getScoreTier } from '@/components/ui/ScoreGauge';
import BreakoutIllustration from '@/components/auth/BreakoutIllustration';
import type { MarketData } from '@/services/api';
import { useValueFlash } from '@/hooks/useValueFlash';
import { tfLabel } from '@/lib/timeframes';
import { Eyebrow, Panel, formatPct, formatPrice } from './Panel';

export const CHART_INTERVALS = [
  { value: '5m', label: '5Dk' },
  { value: '15m', label: '15Dk' },
  { value: '1h', label: '1S' },
  { value: '4h', label: '4S' },
  { value: '1d', label: '1G' },
];

export const CHART_PERIODS = [
  { value: '1mo', label: '1A' },
  { value: '3mo', label: '3A' },
  { value: '6mo', label: '6A' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
];

export type ChartConfig = { interval: string; period: string };

const CHART_HEIGHT = 420;

export function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Eyebrow className="hidden shrink-0 text-slate-600 sm:inline">{label}</Eyebrow>
      <div role="radiogroup" aria-label={label} className="flex flex-1 rounded-lg border border-slate-800 bg-[#0d1118] p-0.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`flex-1 cursor-pointer rounded-md px-2.5 py-1.5 font-data text-xs transition-colors ${
                active ? 'bg-slate-700/80 text-white shadow-sm' : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ picks, onSelect }: { picks: { symbol: string; score?: number }[]; onSelect: (s: string) => void }) {
  return (
    <div className="grid min-h-[520px] items-center gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-5">
        <Eyebrow className="text-blue-400">Başlarken</Eyebrow>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">İncelemek için bir hisse seçin</h2>
        <p className="max-w-md text-sm leading-relaxed text-slate-400">
          Takip listenizden, ana filtreden ya da üstteki aramadan bir hisse seçtiğinizde grafiği, RSI panelini ve kural karnesini burada
          görürsünüz. Aramaya <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 font-data text-[11px] text-slate-300">/</kbd>{' '}
          tuşuyla da ulaşabilirsiniz.
        </p>
        {picks.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500">Hızlı başlangıç</p>
            <div className="flex flex-wrap gap-2">
              {picks.map((p) => (
                <button
                  key={p.symbol}
                  type="button"
                  onClick={() => onSelect(p.symbol)}
                  className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 transition-colors hover:border-slate-600"
                >
                  <span className="font-data text-sm font-semibold text-slate-100">{p.symbol}</span>
                  {p.score !== undefined && (
                    <span className="font-data text-[11px]" style={{ color: getScoreTier(p.score).color }}>
                      {p.score.toFixed(1)}
                    </span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="hidden rounded-xl border border-slate-800/80 bg-[#0b0e14] p-6 opacity-80 lg:block">
        <BreakoutIllustration />
      </div>
    </div>
  );
}

function RulesStrip({ data, onOpen }: { data: MarketData; onOpen: () => void }) {
  const rules = data.rules_breakdown ?? [];
  if (rules.length === 0) return null;
  const met = rules.filter((r) => r.is_met).length;

  return (
    <div className="border-t border-slate-800/80 px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <Eyebrow className="text-slate-400">Kural karnesi</Eyebrow>
          <span className="font-data text-[11px] text-slate-500">
            {met}/{rules.length} kural sağlandı
          </span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
        >
          Ayrıntılar <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rules.map((rule) => (
          <li key={rule.id}>
            <button
              type="button"
              onClick={onOpen}
              title={rule.name}
              className={`inline-flex max-w-[260px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                rule.is_met
                  ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-slate-200 hover:border-emerald-500/40'
                  : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700'
              }`}
            >
              {rule.is_met ? <Check className="h-3 w-3 shrink-0 text-emerald-400" /> : <X className="h-3 w-3 shrink-0" />}
              <span className="font-data text-[10px] text-slate-500">{tfLabel(rule.timeframe)}</span>
              <span className="truncate">{rule.name}</span>
              <span className={`font-data text-[11px] ${rule.is_met ? 'text-emerald-400' : 'text-slate-600'}`}>
                {rule.is_met ? `+${rule.earned_score}` : `0/${rule.score_impact}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InstrumentPanel({
  symbol,
  name,
  data,
  loading,
  score,
  primaryTf,
  chartConfig,
  onIntervalChange,
  onPeriodChange,
  watched,
  watchPending,
  onToggleWatch,
  onOpenRules,
  quickPicks,
  onSelect,
}: {
  symbol: string | null;
  name?: string;
  data: MarketData | null;
  loading: boolean;
  score: number;
  primaryTf: string;
  chartConfig: ChartConfig;
  onIntervalChange: (value: string) => void;
  onPeriodChange: (value: string) => void;
  watched: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
  onOpenRules: () => void;
  quickPicks: { symbol: string; score?: number }[];
  onSelect: (symbol: string) => void;
}) {
  const priceFlash = useValueFlash(symbol, data?.current_price);
  const scoreFlash = useValueFlash(symbol, symbol ? score : undefined);

  if (!symbol) {
    return (
      <Panel>
        <EmptyState picks={quickPicks} onSelect={onSelect} />
      </Panel>
    );
  }

  const ready = !!data && !loading;
  const up = (data?.change_pct ?? 0) >= 0;

  return (
    <Panel>
      {/* Identity + figures */}
      <div className="flex flex-col gap-5 border-b border-slate-800/80 p-4 sm:p-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/detay/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`${symbol} detay sayfasını yeni sekmede aç`}
              className="group inline-flex items-center gap-1.5 font-data text-3xl font-bold tracking-tight text-white transition-colors hover:text-blue-300 sm:text-4xl"
            >
              {symbol}
              <ArrowUpRight className="h-5 w-5 text-slate-600 transition-colors group-hover:text-blue-300" />
            </a>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={watchPending}
                onClick={onToggleWatch}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
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
              <StockAlertDropdown key={symbol} symbol={symbol} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">{name || symbol}</span>
            {data?.has_primary_filter && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-data text-[10px] uppercase tracking-wider ${
                  data.primary_filter_passed
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400'
                }`}
              >
                <Filter className="h-3 w-3" />
                {data.primary_filter_passed ? 'Ana filtre geçti' : 'Ana filtre bekleniyor'} · {tfLabel(primaryTf)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-stretch">
          <div
            className={`flex min-w-0 flex-col sm:min-w-[150px] justify-center rounded-xl border border-slate-800/80 px-4 py-3 transition-colors duration-500 ${
              priceFlash === 'up' ? 'bg-emerald-500/10' : priceFlash === 'down' ? 'bg-rose-500/10' : 'bg-[#0d1118]'
            }`}
          >
            {ready ? (
              <>
                <span className={`font-data text-2xl font-semibold ${priceFlash === 'up' ? 'text-emerald-300' : priceFlash === 'down' ? 'text-rose-300' : 'text-slate-50'}`}>
                  ₺{formatPrice(data!.current_price)}
                </span>
                <span className={`mt-1 font-data text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {up ? '▲' : '▼'} {formatPct(data!.change_pct)} <span className="hidden text-slate-600 sm:inline">· 15 dk gecikmeli</span>
                </span>
              </>
            ) : (
              <span className="flex items-center gap-2 font-data text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" /> Yükleniyor
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenRules}
            disabled={!ready}
            title="Kural karnesini aç"
            className={`group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800/80 py-2 pl-2 pr-3 text-left transition-colors duration-500 hover:border-slate-600 disabled:cursor-default ${
              scoreFlash === 'up' ? 'bg-emerald-500/10' : scoreFlash === 'down' ? 'bg-rose-500/10' : 'bg-[#0d1118]'
            }`}
          >
            <ScoreGauge score={ready ? score : undefined} size="md" />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-medium text-slate-200">Güven skoru</span>
              <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-slate-500 transition-colors group-hover:text-blue-300">
                Karneyi aç <ChevronRight className="h-3 w-3" />
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 border-b border-slate-800/80 px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between md:gap-4">
        <Segmented label="Mum" options={CHART_INTERVALS} value={chartConfig.interval} onChange={onIntervalChange} />
        <Segmented label="Aralık" options={CHART_PERIODS} value={chartConfig.period} onChange={onPeriodChange} />
      </div>

      {/* Chart */}
      <div className="relative px-2 pb-2 pt-3 sm:px-3">
        {ready ? (
          <ChartWrapper
            key={`${symbol}-${chartConfig.interval}-${chartConfig.period}`}
            candles={data!.candles}
            indicators={data!.indicators}
            rsiPane={data!.rsi_pane}
            height={CHART_HEIGHT}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 font-data text-xs text-slate-600" style={{ height: CHART_HEIGHT }}>
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> Grafik hazırlanıyor
          </div>
        )}
      </div>

      {ready && <RulesStrip data={data!} onOpen={onOpenRules} />}
    </Panel>
  );
}

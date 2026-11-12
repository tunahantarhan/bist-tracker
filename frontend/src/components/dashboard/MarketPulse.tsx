'use client';

import { useEffect, useState } from 'react';
import { fetchMacroData, type MacroItem, type MarketOverviewResponse } from '@/services/api';
import { getScoreTier } from '@/components/ui/ScoreGauge';
import { SCORE_BANDS, bandMidpoint, formatIstanbulTime, summarizeScan } from '@/lib/scanSummary';
import { tfLabel } from '@/lib/timeframes';
import { Eyebrow, formatPct } from './Panel';

function formatMacro(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MacroTile({ item }: { item: MacroItem }) {
  const up = item.change_pct >= 0;
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-[#12161f] px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-slate-400">{item.label}</span>
        <span className={`font-data text-[11px] ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(item.change_pct)}</span>
      </div>
      <p className="mt-2 font-data text-lg font-semibold tracking-tight text-slate-100">
        {item.prefix}
        {formatMacro(item.current_price)}
        {item.suffix}
      </p>
    </div>
  );
}

/**
 * Top strip of the dashboard: what the last scan looks like (counts + score
 * distribution) next to the macro indicators.
 */
export default function MarketPulse({ overview }: { overview: MarketOverviewResponse | null }) {
  const [macro, setMacro] = useState<MacroItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchMacroData()
        .then((data) => !cancelled && data?.length && setMacro(data))
        .catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const summary = overview ? summarizeScan(overview) : null;
  const total = summary ? Math.max(1, summary.scanned) : 1;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <div className="col-span-2 rounded-2xl border border-slate-800/80 bg-[#12161f] px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow className="text-slate-500">Son tarama</Eyebrow>
          <span className="font-data text-[11px] text-slate-500">
            {summary?.scannedAt ? formatIstanbulTime(summary.scannedAt) : '--:--'} · {summary ? tfLabel(summary.timeframe) : '…'} ana filtre
          </span>
        </div>

        <div className="mt-2 flex items-baseline gap-5">
          {[
            { label: 'hisse', value: summary?.scanned },
            { label: 'filtreden geçen', value: summary?.passed, accent: true },
            { label: 'ort. skor', value: summary ? summary.average.toFixed(1) : undefined },
          ].map((kpi) => (
            <div key={kpi.label} className="flex items-baseline gap-1.5">
              {kpi.value !== undefined ? (
                <span className={`font-data text-lg font-semibold ${kpi.accent ? 'text-emerald-400' : 'text-slate-100'}`}>{kpi.value}</span>
              ) : (
                <span className="inline-block h-5 w-8 animate-pulse rounded bg-slate-800" />
              )}
              <span className="text-[11px] text-slate-500">{kpi.label}</span>
            </div>
          ))}
        </div>

        {/* Score distribution as one stacked bar */}
        <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800" role="img" aria-label="Skor dağılımı">
          {summary &&
            summary.bands.map((count, i) =>
              count ? (
                <span
                  key={SCORE_BANDS[i].label}
                  title={`${SCORE_BANDS[i].label}: ${count} hisse`}
                  className="h-full transition-[width] duration-700"
                  style={{ width: `${(count / total) * 100}%`, backgroundColor: getScoreTier(bandMidpoint(i)).color, opacity: 0.85 }}
                />
              ) : null
            )}
        </div>
        <div className="mt-1.5 hidden justify-between font-data text-[10px] text-slate-600 sm:flex">
          {SCORE_BANDS.map((band, i) => (
            <span key={band.label} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getScoreTier(bandMidpoint(i)).color }} />
              {band.label}
              <span className="text-slate-400">{summary ? summary.bands[i] : '–'}</span>
            </span>
          ))}
        </div>
      </div>

      {macro.length > 0
        ? macro.slice(0, 4).map((item) => <MacroTile key={item.symbol} item={item} />)
        : Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-slate-800/80 bg-[#12161f]" />
          ))}
    </div>
  );
}

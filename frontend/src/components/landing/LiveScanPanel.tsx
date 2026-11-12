'use client';

import { useEffect, useState } from 'react';
import { fetchMarketOverview, type MarketOverviewResponse } from '@/services/api';
import { getScoreTier } from '@/components/ui/ScoreGauge';
import { SCORE_BANDS as BANDS, bandMidpoint, formatIstanbulTime, isBistOpen, summarizeScan, type ScanSummary } from '@/lib/scanSummary';
import { tfLabel } from '@/lib/timeframes';

type Summary = ScanSummary & { open: boolean };

function summarize(data: MarketOverviewResponse): Summary {
  return { ...summarizeScan(data), open: isBistOpen() };
}

/**
 * Aggregate view of the latest scan for the landing page. It deliberately shows
 * no symbols: visitors see how the engine behaves, not a list of picks.
 */
export default function LiveScanPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMarketOverview()
      .then((data) => !cancelled && setSummary(summarize(data)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const maxBand = summary ? Math.max(1, ...summary.bands) : 1;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#12161f]/90 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
        <div className="flex items-center gap-2.5 font-data text-[11px] uppercase tracking-[0.16em] text-slate-400">
          <span className="relative flex h-2 w-2">
            {summary?.open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${summary?.open ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </span>
          Son tarama
        </div>
        <span className="font-data text-[11px] text-slate-500">
          {summary
            ? `${summary.open ? 'Seans açık' : 'Seans kapalı'}${
                summary.scannedAt
                  ? ` · ${formatIstanbulTime(summary.scannedAt)}`
                  : ''
              }`
            : failed
              ? 'veri alınamadı'
              : 'yükleniyor…'}
        </span>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800">
        {[
          { label: 'Taranan hisse', value: summary ? String(summary.scanned) : null },
          { label: 'Ana filtreyi geçen', value: summary ? String(summary.passed) : null, accent: true },
          { label: 'Ortalama skor', value: summary ? summary.average.toFixed(1) : null },
        ].map((kpi) => (
          <div key={kpi.label} className="px-4 py-4 sm:px-5">
            <p className="text-[11px] leading-tight text-slate-500">{kpi.label}</p>
            {kpi.value !== null ? (
              <p className={`mt-1.5 font-data text-2xl font-semibold sm:text-3xl ${kpi.accent ? 'text-emerald-400' : 'text-slate-100'}`}>{kpi.value}</p>
            ) : (
              <div className="mt-2.5 h-7 w-12 animate-pulse rounded bg-slate-800" />
            )}
          </div>
        ))}
      </div>

      {/* Score distribution */}
      <div className="px-5 pb-5 pt-4">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium text-slate-300">Skor dağılımı</p>
          <p className="font-data text-[10px] text-slate-600">hisse sayısı</p>
        </div>
        <div className="mt-4 grid h-32 grid-cols-5 items-end gap-2.5" role="img" aria-label="Taranan hisselerin skor aralıklarına göre dağılımı">
          {BANDS.map((band, i) => {
            const count = summary?.bands[i] ?? 0;
            const tier = getScoreTier(bandMidpoint(i));
            const height = summary ? Math.max(4, (count / maxBand) * 100) : 18 + i * 8;
            return (
              <div key={band.label} className="flex h-full flex-col items-center justify-end gap-1.5">
                <span className="font-data text-[11px] text-slate-400">{summary ? count : ''}</span>
                <div
                  className={`w-full rounded-t-md transition-[height] duration-700 ease-out ${summary ? '' : 'animate-pulse bg-slate-800'}`}
                  style={summary ? { height: `${height}%`, backgroundColor: tier.color, opacity: count ? 0.85 : 0.25 } : { height: `${height}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-5 gap-2.5">
          {BANDS.map((band) => (
            <span key={band.label} className="text-center font-data text-[10px] text-slate-500">
              {band.label}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-900/40 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
        Ana filtre: <span className="text-slate-300">{summary ? tfLabel(summary.timeframe, 'long') : '…'} RSI (14) düşen trend kırılımı</span>.
        Hisse bazlı skorlar giriş yaptıktan sonra görünür.
      </div>
    </div>
  );
}

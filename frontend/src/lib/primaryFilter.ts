import type { PrimaryConfirm, PrimaryFilterInfo } from '@/services/api';

type PrimaryState = {
  primary_filter_passed?: boolean;
  primary_rsi_passed?: boolean;
  primary_confirm?: PrimaryConfirm | null;
};

/** Badge text/tone of the primary filter, including the "waiting for the average" step. */
export function primaryFilterBadge(data: PrimaryState): { label: string; tone: 'passed' | 'waiting' | 'idle' } {
  if (data.primary_filter_passed) return { label: 'Ana filtre geçti', tone: 'passed' };
  const confirm = data.primary_confirm;
  if (confirm && (confirm.armed_at || data.primary_rsi_passed)) {
    return { label: `RSI sağlandı · ${confirm.label} teyidi bekleniyor`, tone: 'waiting' };
  }
  return { label: 'Ana filtre bekleniyor', tone: 'idle' };
}

export const PRIMARY_BADGE_TONES = {
  passed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  waiting: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  idle: 'border-slate-700 bg-slate-800/50 text-slate-400',
} as const;

/** "aynı gün kapanışa kadar" / "en geç ertesi seans kapanışına kadar" / "3 seans içinde" */
export function confirmWindowText(sessions: number | null | undefined): string {
  const n = sessions ?? 1;
  if (n <= 0) return 'aynı gün kapanışa kadar';
  if (n === 1) return 'en geç ertesi seans kapanışına kadar';
  return `${n} seans içinde`;
}

/** Unix seconds → "24 Kas 11:05" (Istanbul time). */
export function formatUnix(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

/** Bar start (ISO) → "11:05" (Istanbul time); 5m bars are labelled by their start like TradingView. */
export function formatBarTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}

const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** Plain-language description of both steps with the live settings (fallbacks = agreed defaults). */
export function primaryFilterSteps(info: PrimaryFilterInfo | null | undefined, timeframeLong: string) {
  const lookback = info?.lookback ?? 60;
  const minPeak = info?.min_peak ?? 67;
  const maxEnd = info?.max_trend_end ?? 30;
  const confirmBars = info?.confirm_bars ?? 2;
  const maxAgo = info?.max_bars_since_break ?? 4;
  const nearGap = info?.near_gap ?? 0;
  const rsi =
    `${timeframeLong} grafikte RSI (14), son ${lookback} mumda ${num(minPeak)} üstünde bir tepe yapıp ardından daha düşük bir tepe ` +
    `oluşturur; iki tepeden geçen düşen trend çizgisi çizilir. RSI bu çizgiyi dip bölgede (çizgi ≤ ${num(maxEnd)}) yükselerek ` +
    `keserse (${confirmBars} mum onaylı, en fazla ${maxAgo} mum önce)` +
    (nearGap > 0 ? ` ya da çizgiye ${num(nearGap)} puandan az kalmış ve yükseliyorsa` : '') +
    ' 1. adım tamamlanır.';
  const confirm = info?.confirm;
  const ma = confirm
    ? `RSI sinyalinden sonra ${confirmWindowText(confirm.window_sessions)} bir 5 dakikalık mum, ${confirm.length} mumluk hareketli ` +
      `ortalamanın (${confirm.label}) üstünde kapanmalı. Anlık fiyatın çizgiye değmesi yetmez; mumun kapanışı sayılır.`
    : null;
  return { rsi, ma };
}

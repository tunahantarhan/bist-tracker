import type { MarketOverviewResponse } from '@/services/api';

// Score bands match the ScoreGauge tiers used across the app
export const SCORE_BANDS = [
  { from: 0, to: 0, label: '0' },
  { from: 0, to: 25, label: '1–25' },
  { from: 25, to: 50, label: '26–50' },
  { from: 50, to: 75, label: '51–75' },
  { from: 75, to: 100, label: '76–100' },
] as const;

export function scoreBandIndex(score: number): number {
  if (score <= 0) return 0;
  if (score <= 25) return 1;
  if (score <= 50) return 2;
  if (score <= 75) return 3;
  return 4;
}

/** Representative score of a band, for picking its tier color. */
export function bandMidpoint(index: number): number {
  const band = SCORE_BANDS[index];
  return band.to === 0 ? 0 : (band.from + band.to) / 2;
}

function istanbulParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** BIST continuous session, Istanbul time: weekdays 10:00–18:10. Mirrors backend core/market_hours.py. */
export function isBistOpen(at: Date = new Date()): boolean {
  const { weekday, minutes } = istanbulParts(at);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return minutes >= 10 * 60 && minutes <= 18 * 60 + 10;
}

export function formatIstanbulTime(at: Date, withSeconds = false): string {
  return at.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    timeZone: 'Europe/Istanbul',
  });
}

export type ScanSummary = {
  scanned: number;
  passed: number;
  average: number;
  bands: number[];
  timeframe: string;
  scannedAt: Date | null;
};

export function summarizeScan(data: MarketOverviewResponse): ScanSummary {
  const items = data.items ?? [];
  const bands = [0, 0, 0, 0, 0];
  let total = 0;
  for (const item of items) {
    bands[scoreBandIndex(item.score)]++;
    total += item.score;
  }
  return {
    scanned: items.length,
    passed: items.filter((i) => i.primary_filter_passed).length,
    average: items.length ? total / items.length : 0,
    bands,
    timeframe: data.primary_filter_timeframe ?? '4h',
    scannedAt: data.generated_at ? new Date(data.generated_at * 1000) : null,
  };
}

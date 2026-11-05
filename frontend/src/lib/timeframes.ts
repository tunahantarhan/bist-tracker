// Turkish labels for candle timeframes ("1h" would read like "1 hafta" in Turkish, so never show it raw)

const TIMEFRAME_LABELS: Record<string, { short: string; long: string; full: string; badge: string }> = {
  '5m': { short: '5Dk', long: '5 Dakikalık (5Dk)', full: '5 Dakika', badge: '5 DK' },
  '15m': { short: '15Dk', long: '15 Dakikalık (15Dk)', full: '15 Dakika', badge: '15 DK' },
  '1h': { short: '1S', long: '1 Saatlik (1S)', full: '1 Saat', badge: '1 SAAT' },
  '4h': { short: '4S', long: '4 Saatlik (4S)', full: '4 Saat', badge: '4 SAAT' },
  '1d': { short: '1G', long: 'Günlük (1G)', full: '1 Gün', badge: '1 GÜN' },
};

export type TimeframeLabelKind = 'short' | 'long' | 'full' | 'badge';

export function tfLabel(tf: string | null | undefined, kind: TimeframeLabelKind = 'short'): string {
  if (!tf) return '';
  return TIMEFRAME_LABELS[tf.toLowerCase()]?.[kind] ?? tf.toUpperCase();
}

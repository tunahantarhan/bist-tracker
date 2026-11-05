import { useEffect, useState } from 'react';

export type FlashDirection = 'up' | 'down';

/**
 * Returns 'up' / 'down' for `durationMs` after `value` changes, then null.
 * Changing `key` (e.g. the selected symbol) resets the baseline without flashing,
 * so switching stocks never lights up the price.
 */
export function useValueFlash(key: string | null, value: number | undefined, durationMs = 1000): FlashDirection | null {
  const [baseline, setBaseline] = useState({ key, value });
  const [flash, setFlash] = useState<{ direction: FlashDirection } | null>(null);

  // Adjusting state during render (instead of in an effect) avoids an extra render pass
  if (baseline.key !== key || baseline.value !== value) {
    const sameSeries = baseline.key === key && key !== null;
    const comparable = value !== undefined && baseline.value !== undefined;
    setBaseline({ key, value });
    setFlash(sameSeries && comparable ? { direction: value > baseline.value! ? 'up' : 'down' } : null);
  }

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), durationMs);
    return () => clearTimeout(timer);
  }, [flash, durationMs]);

  return flash?.direction ?? null;
}

import type { MarketState } from '@/services/api';

const TZ = 'Europe/Istanbul';

function istanbulDay(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Says what the shown price is: a delayed in-session print, the closing auction, or
 * the official close (with the date when it is not today). Prices come from one quote
 * snapshot on the backend, so this stamp is the same everywhere.
 */
export function priceStampText(priceTime?: number | null, state?: MarketState, delayMinutes = 15): string | null {
  if (!priceTime) return null;
  const at = new Date(priceTime * 1000);
  const time = at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  if (state === 'open') return `${delayMinutes} dk gecikmeli · ${time}`;
  if (state === 'auction') return `Kapanış seansı · ${time}`;
  const today = istanbulDay(new Date()) === istanbulDay(at);
  const date = at.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: TZ });
  return today ? `Kapanış · ${time}` : `Kapanış · ${date} ${time}`;
}

export default function PriceStamp({
  priceTime,
  state,
  delayMinutes,
  className = '',
}: {
  priceTime?: number | null;
  state?: MarketState;
  delayMinutes?: number;
  className?: string;
}) {
  const text = priceStampText(priceTime, state, delayMinutes);
  if (!text) return null;
  const live = state === 'open' || state === 'auction';
  return (
    <span className={`inline-flex items-center gap-1.5 font-data text-[11px] text-slate-500 ${className}`} title="Fiyatın ait olduğu zaman (İstanbul)">
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
      {text}
    </span>
  );
}

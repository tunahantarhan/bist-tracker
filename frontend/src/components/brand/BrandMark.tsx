import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * Logo mark: an RSI line breaking above its descending (dashed) trendline,
 * the signal the primary filter looks for.
 */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-blue-600" />
      <line x1="6" y1="9" x2="26" y2="21" stroke="white" strokeOpacity="0.45" strokeWidth="1.6" strokeDasharray="2.2 2.2" strokeLinecap="round" />
      <polyline
        points="5,23 10,13.5 14,20 18,17 21.5,22.5 26,8"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="8" r="2" className="fill-emerald-300" />
    </svg>
  );
}

export function BrandLogo({ href = '/', size = 'md', suffix }: { href?: string; size?: 'sm' | 'md'; suffix?: string }) {
  return (
    <Link href={href} className="group inline-flex w-fit items-center gap-3" title="Ana sayfaya dön">
      <BrandMark className={`${size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 transition-transform group-hover:scale-105`} />
      <span className="flex flex-col leading-none">
        <span className={`${size === 'sm' ? 'text-base' : 'text-lg'} font-bold tracking-tight text-slate-100 transition-colors group-hover:text-blue-300`}>
          {BRAND.name}
        </span>
        {suffix && (
          <span className="mt-1 font-data text-[10px] uppercase tracking-[0.18em] text-slate-500">{suffix}</span>
        )}
      </span>
    </Link>
  );
}

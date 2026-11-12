import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BellRing, Check, Compass, Filter, Star, X } from 'lucide-react';
import type { AppNotification, StockOverviewItem } from '@/services/api';
import { EmptyRow, Eyebrow, Panel, PanelHeader, formatPct, formatPrice } from '@/components/dashboard/Panel';
import { relativeTime } from '@/lib/time';

function scoreTone(score: number): string {
  if (score >= 70) return 'bg-emerald-400';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-slate-500';
}

export function WatchlistCards({
  symbols,
  market,
  onRemove,
}: {
  symbols: string[];
  market: Record<string, StockOverviewItem>;
  onRemove: (symbol: string) => void;
}) {
  // Highest score first; stocks without scan data go last
  const sorted = [...symbols].sort((a, b) => (market[b]?.score ?? -1) - (market[a]?.score ?? -1));

  return (
    <Panel>
      <PanelHeader
        icon={Star}
        title="Takip listem"
        subtitle="Skora göre sıralı; karta tıklayınca hisse detayı açılır"
        accent="amber"
        count={symbols.length}
      />
      {symbols.length === 0 ? (
        <EmptyRow>
          Takip listen boş. Üstteki aramadan veya paneldeki yıldız simgesinden hisse ekleyebilirsin.
          <span className="mt-3 block">
            <Link href="/ana-sayfa" className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300">
              Panele git <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </span>
        </EmptyRow>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {sorted.map((symbol) => {
            const item = market[symbol];
            const up = (item?.change_pct ?? 0) >= 0;
            return (
              <li key={symbol} className="group relative">
                <Link
                  href={`/detay/${symbol}`}
                  className="block rounded-xl border border-slate-800 bg-[#0d1118] p-3.5 transition-colors hover:border-slate-700 hover:bg-[#10151d]"
                >
                  <div className="flex items-start justify-between gap-3 pr-6">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-data text-sm font-semibold text-slate-100">
                        {symbol}
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-600 transition-colors group-hover:text-blue-400" />
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{item?.name ?? 'Tarama verisi yok'}</p>
                    </div>
                    {item?.has_primary_filter && item.primary_filter_passed && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-data text-[10px] text-amber-300"
                        title="Ana filtreyi geçti"
                      >
                        <Filter className="h-3 w-3" /> filtre
                      </span>
                    )}
                  </div>

                  {item ? (
                    <>
                      <div className="mt-3 flex items-end justify-between">
                        <span className="font-data text-lg font-semibold text-slate-100">₺{formatPrice(item.current_price)}</span>
                        <span className={`font-data text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(item.change_pct)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div className={`h-full rounded-full ${scoreTone(item.score)}`} style={{ width: `${Math.min(100, item.score)}%` }} />
                        </div>
                        <span className="w-12 text-right font-data text-[11px] text-slate-400">{item.score.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-[11px] text-slate-600">Hisse taranan evrende değil veya tarama bekleniyor.</p>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => onRemove(symbol)}
                  aria-label={`${symbol} takipten çıkar`}
                  title="Takipten çıkar"
                  className="absolute right-2.5 top-2.5 cursor-pointer rounded-md p-1 text-slate-600 opacity-100 transition-all hover:bg-rose-500/10 hover:text-rose-400 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function GettingStarted({
  steps,
}: {
  steps: { label: string; hint: string; done: boolean; href?: string; onClick?: () => void }[];
}) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <Panel>
      <PanelHeader icon={Compass} title="Başlangıç" subtitle="Hesabından en iyi şekilde yararlan" accent="blue" />
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <Eyebrow className="text-slate-500">İlerleme</Eyebrow>
          <span className="font-data text-[11px] text-slate-400">
            {done}/{steps.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-blue-500 transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="space-y-1 p-2.5">
        {steps.map((s, i) => {
          const body = (
            <>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-data text-[11px] ${
                  s.done ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 text-slate-500'
                }`}
              >
                {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${s.done ? 'text-slate-500 line-through decoration-slate-700' : 'text-slate-200'}`}>{s.label}</span>
                {!s.done && <span className="block text-[11px] text-slate-500">{s.hint}</span>}
              </span>
              {!s.done && (s.href || s.onClick) && <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />}
            </>
          );
          const cls = 'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left';
          return (
            <li key={s.label}>
              {!s.done && s.href ? (
                <Link href={s.href} className={`${cls} transition-colors hover:bg-slate-800/40`}>
                  {body}
                </Link>
              ) : !s.done && s.onClick ? (
                <button type="button" onClick={s.onClick} className={`${cls} cursor-pointer transition-colors hover:bg-slate-800/40`}>
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function RecentNotifications({ items, onShowAll }: { items: AppNotification[]; onShowAll: () => void }) {
  return (
    <Panel>
      <PanelHeader
        icon={BellRing}
        title="Son bildirimler"
        accent="blue"
        right={
          <button type="button" onClick={onShowAll} className="cursor-pointer text-[11px] text-blue-400 hover:text-blue-300">
            Tümü
          </button>
        }
      />
      {items.length === 0 ? (
        <EmptyRow>Henüz bildirim yok. Alarmların tetiklendiğinde burada görünecek.</EmptyRow>
      ) : (
        <ul className="divide-y divide-slate-800/70">
          {items.map((n) => (
            <li key={n.id} className="flex gap-3 px-4 py-3">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.is_read ? 'bg-slate-700' : 'bg-blue-400'}`} />
              <div className="min-w-0 flex-1">
                <p className={`line-clamp-2 text-xs leading-relaxed ${n.is_read ? 'text-slate-400' : 'text-slate-200'}`}>{n.message}</p>
                <p className="mt-1 font-data text-[10px] text-slate-600">
                  {n.symbol && <span className="mr-1.5 text-slate-400">{n.symbol}</span>}
                  {relativeTime(n.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

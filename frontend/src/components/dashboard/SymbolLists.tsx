'use client';

import { useState } from 'react';
import { Bookmark, Clock3, Filter, Loader2, Sparkles, X } from 'lucide-react';
import type { PrimaryFilterInfo, StockOverviewItem } from '@/services/api';
import ScoreGauge from '@/components/ui/ScoreGauge';
import { tfLabel } from '@/lib/timeframes';
import { formatUnix, primaryFilterSteps } from '@/lib/primaryFilter';
import { ACCENT, Collapsible, EmptyRow, Panel, PanelHeader, formatPct, type Accent } from './Panel';

function SymbolRow({
  symbol,
  name,
  changePct,
  selected,
  accent,
  onSelect,
  right,
  action,
}: {
  symbol: string;
  name?: string;
  changePct?: number;
  selected: boolean;
  accent: Accent;
  onSelect: () => void;
  right?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li
      className={`group flex items-center border-l-2 transition-colors ${
        selected ? `${ACCENT[accent].ring} bg-slate-800/50` : 'border-l-transparent hover:bg-slate-800/25'
      }`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 py-2.5 pl-3.5 pr-2 text-left">
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <span className="font-data text-sm font-semibold text-slate-100">{symbol}</span>
            {changePct !== undefined && (
              <span className={`font-data text-[10px] ${changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(changePct)}</span>
            )}
          </span>
          <span className="truncate text-[11px] text-slate-500">{name || symbol}</span>
        </span>
        {right}
      </button>
      {action}
    </li>
  );
}

export function WatchlistPanel({
  watchlist,
  items,
  selectedSymbol,
  pending,
  onSelect,
  onRemove,
  className = '',
}: {
  watchlist: string[];
  items: Record<string, StockOverviewItem>;
  selectedSymbol: string | null;
  pending: Record<string, boolean>;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Panel className={className}>
      <PanelHeader
        icon={Bookmark}
        title="Takip listem"
        subtitle="Skorlar her taramada güncellenir"
        accent="blue"
        count={watchlist.length}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      <Collapsible open={open}>
        {watchlist.length === 0 ? (
          <EmptyRow>
            Listeniz boş. Üstteki aramadan hisse bulup <span className="text-slate-300">+</span> ile ekleyin.
          </EmptyRow>
        ) : (
          <ul className="scrollbar-hide max-h-[260px] divide-y divide-slate-800/60 overflow-y-auto lg:max-h-[340px]">
            {watchlist.map((symbol) => {
              const item = items[symbol];
              const busy = !!pending[symbol];
              return (
                <SymbolRow
                  key={symbol}
                  symbol={symbol}
                  name={item?.name}
                  changePct={item?.change_pct}
                  selected={selectedSymbol === symbol}
                  accent="blue"
                  onSelect={() => onSelect(symbol)}
                  right={<ScoreGauge score={item?.score} size="sm" />}
                  action={
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(symbol)}
                      title="Takip listesinden çıkar"
                      aria-label={`${symbol} takip listesinden çıkar`}
                      className="mr-2.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-500 transition-all hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  }
                />
              );
            })}
          </ul>
        )}
      </Collapsible>
    </Panel>
  );
}

export function PrimaryFilterPanel({
  items,
  waiting = [],
  info,
  loading,
  timeframe,
  selectedSymbol,
  onSelect,
  className = '',
}: {
  items: StockOverviewItem[];
  /** RSI signal given, waiting for a 5m bar to close above the average */
  waiting?: StockOverviewItem[];
  info?: PrimaryFilterInfo | null;
  loading: boolean;
  timeframe: string;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const steps = primaryFilterSteps(info, tfLabel(timeframe, 'long'));
  const confirm = info?.confirm;

  return (
    <Panel className={`border-amber-500/20 ${className}`}>
      <PanelHeader
        icon={Filter}
        title="Ana filtre"
        subtitle={confirm ? `${tfLabel(timeframe)} RSI kırılımı + ${confirm.label} teyidi` : `${tfLabel(timeframe, 'long')} RSI kırılımı`}
        accent="amber"
        count={items.length}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      <Collapsible open={open}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 font-data text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> Taranıyor…
          </div>
        ) : (
          <>
            {items.length === 0 ? (
              <EmptyRow>Şu an ana filtreyi geçen hisse yok. Liste her taramada yenilenir.</EmptyRow>
            ) : (
              <ul className="scrollbar-hide max-h-[260px] divide-y divide-slate-800/60 overflow-y-auto lg:max-h-[340px]">
                {items.map((item) => (
                  <SymbolRow
                    key={item.symbol}
                    symbol={item.symbol}
                    name={item.name}
                    changePct={item.change_pct}
                    selected={selectedSymbol === item.symbol}
                    accent="amber"
                    onSelect={() => onSelect(item.symbol)}
                    right={<ScoreGauge score={item.score} size="sm" />}
                  />
                ))}
              </ul>
            )}

            {waiting.length > 0 && (
              <div className="border-t border-slate-800/70">
                <p
                  className="flex items-center gap-1.5 bg-slate-900/40 px-3.5 py-2 font-data text-[10px] uppercase tracking-wider text-slate-500"
                  title="RSI kırılımı geldi; 5 dakikalık bir mumun ortalamanın üstünde kapanması bekleniyor"
                >
                  <Clock3 className="h-3 w-3 text-amber-400/70" /> Teyit bekleyen · {waiting.length}
                </p>
                <ul className="scrollbar-hide max-h-[200px] divide-y divide-slate-800/60 overflow-y-auto">
                  {waiting.map((item) => (
                    <SymbolRow
                      key={item.symbol}
                      symbol={item.symbol}
                      name={item.name}
                      changePct={item.change_pct}
                      selected={selectedSymbol === item.symbol}
                      accent="amber"
                      onSelect={() => onSelect(item.symbol)}
                      right={
                        <span className="shrink-0 text-right font-data text-[10px] leading-tight text-slate-500">
                          {item.primary_confirm?.label ?? 'MA'} bekleniyor
                          <br />
                          <span className="text-slate-600">son {formatUnix(item.primary_confirm?.deadline)}</span>
                        </span>
                      }
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="border-t border-slate-800/70">
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            aria-expanded={infoOpen}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium text-amber-400/80 transition-colors hover:text-amber-300"
          >
            <Sparkles className="h-3 w-3" /> Filtre nasıl çalışır?
          </button>
          <Collapsible open={infoOpen}>
            <div className="space-y-2.5 border-t border-slate-800/70 bg-amber-500/[0.03] px-4 py-3.5 text-xs leading-relaxed text-slate-400">
              <p>
                <strong className="text-slate-200">1. RSI kırılımı.</strong> {steps.rsi}
              </p>
              {steps.ma && (
                <p>
                  <strong className="text-slate-200">2. Ortalama teyidi.</strong> {steps.ma}
                </p>
              )}
              <p>
                {steps.ma
                  ? 'İki adım tamamlanınca hisse listeye girer ve bildirim gönderilir; bekleme süresi bitene kadar listede kalır. “Teyit bekleyen” hisselerde yalnızca 1. adım tamamdır.'
                  : 'Bu adımı geçen hisseler listeye girer ve bildirim gönderilir.'}{' '}
                Diğer kurallar yalnızca skoru belirler.
              </p>
            </div>
          </Collapsible>
        </div>
      </Collapsible>
    </Panel>
  );
}

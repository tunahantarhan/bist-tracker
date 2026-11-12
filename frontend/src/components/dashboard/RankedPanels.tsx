'use client';

import { useState } from 'react';
import { Activity, ChevronDown, Trophy } from 'lucide-react';
import type { StockOverviewItem } from '@/services/api';
import { getScoreTier } from '@/components/ui/ScoreGauge';
import { Collapsible, EmptyRow, Panel, PanelHeader, formatPct, formatPrice } from './Panel';

const COLLAPSED_ROWS = 5;

function ShowMore({ expanded, total, onToggle }: { expanded: boolean; total: number; onToggle: () => void }) {
  if (total <= COLLAPSED_ROWS) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-slate-800/70 py-2.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-800/30 hover:text-slate-200"
    >
      {expanded ? 'Daha az göster' : `Tümünü göster (${total})`}
      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: COLLAPSED_ROWS }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-800/50" />
      ))}
    </div>
  );
}

export function TopScoredPanel({
  items,
  loading,
  selectedSymbol,
  onSelect,
}: {
  items: StockOverviewItem[];
  loading: boolean;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const renderRow = (item: StockOverviewItem, i: number) => {
    const tier = getScoreTier(item.score);
    return (
      <li key={item.symbol}>
        <button
          type="button"
          onClick={() => onSelect(item.symbol)}
          className={`grid w-full cursor-pointer grid-cols-[1.75rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors ${
            selectedSymbol === item.symbol ? 'bg-slate-800/50' : 'hover:bg-slate-800/25'
          }`}
        >
          <span className={`font-data text-xs ${i < 3 ? 'text-emerald-400' : 'text-slate-600'}`}>{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <span className="font-data text-sm font-semibold text-slate-100">{item.symbol}</span>
              <span className="truncate text-[11px] text-slate-500">{item.name}</span>
            </span>
            <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <span
                className="block h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.max(2, item.score)}%`, backgroundColor: tier.color }}
              />
            </span>
          </span>
          <span className="w-12 text-right font-data text-sm font-semibold" style={{ color: tier.color }}>
            {item.score.toFixed(1)}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Panel>
      <PanelHeader icon={Trophy} title="En yüksek skor" subtitle="Evrendeki ilk 10 hisse" accent="emerald" />
      {loading ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <EmptyRow>Henüz skorlanmış hisse yok.</EmptyRow>
      ) : (
        <>
          <ol className="divide-y divide-slate-800/60">{items.slice(0, COLLAPSED_ROWS).map((item, i) => renderRow(item, i))}</ol>
          {items.length > COLLAPSED_ROWS && (
            <Collapsible open={expanded}>
              <ol className="divide-y divide-slate-800/60 border-t border-slate-800/60">
                {items.slice(COLLAPSED_ROWS).map((item, i) => renderRow(item, i + COLLAPSED_ROWS))}
              </ol>
            </Collapsible>
          )}
        </>
      )}
      <ShowMore expanded={expanded} total={items.length} onToggle={() => setExpanded((v) => !v)} />
    </Panel>
  );
}

const MOVERS_COUNT = 10;

export function MoversPanel({
  items,
  loading,
  selectedSymbol,
  onSelect,
}: {
  items: StockOverviewItem[];
  loading: boolean;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const [tab, setTab] = useState<'up' | 'down'>('up');
  const [expanded, setExpanded] = useState(false);

  const sorted = [...items].sort((a, b) => (tab === 'up' ? b.change_pct - a.change_pct : a.change_pct - b.change_pct));
  const list = sorted.filter((i) => (tab === 'up' ? i.change_pct > 0 : i.change_pct < 0)).slice(0, MOVERS_COUNT);
  const maxAbs = Math.max(0.01, ...list.map((i) => Math.abs(i.change_pct)));

  const renderRow = (item: StockOverviewItem) => {
    const positive = item.change_pct >= 0;
    return (
      <li key={item.symbol}>
        <button
          type="button"
          onClick={() => onSelect(item.symbol)}
          className={`grid w-full cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 text-left transition-colors ${
            selectedSymbol === item.symbol ? 'bg-slate-800/50' : 'hover:bg-slate-800/25'
          }`}
        >
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <span className="font-data text-sm font-semibold text-slate-100">{item.symbol}</span>
              <span className="truncate text-[11px] text-slate-500">{item.name}</span>
            </span>
            <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <span
                className={`block h-full rounded-full transition-[width] duration-700 ${positive ? 'bg-emerald-500/80' : 'bg-rose-500/80'}`}
                style={{ width: `${(Math.abs(item.change_pct) / maxAbs) * 100}%` }}
              />
            </span>
          </span>
          <span className="hidden font-data text-xs text-slate-400 sm:block">₺{formatPrice(item.current_price)}</span>
          <span
            className={`w-[4.5rem] rounded-md px-2 py-1 text-right font-data text-xs ${
              positive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
            }`}
          >
            {formatPct(item.change_pct)}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Panel>
      <PanelHeader
        icon={Activity}
        title="Günün hareketlileri"
        subtitle="Taranan evrende günlük değişim"
        accent="blue"
        right={
          <div role="tablist" className="flex rounded-lg border border-slate-800 bg-[#0d1118] p-0.5">
            {(
              [
                { key: 'up', label: 'Yükselen' },
                { key: 'down', label: 'Düşen' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  tab === t.key
                    ? t.key === 'up'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      {loading ? (
        <SkeletonRows />
      ) : list.length === 0 ? (
        <EmptyRow>{tab === 'up' ? 'Bugün yükselen hisse yok.' : 'Bugün düşen hisse yok.'}</EmptyRow>
      ) : (
        <>
          <ol className="divide-y divide-slate-800/60">{list.slice(0, COLLAPSED_ROWS).map(renderRow)}</ol>
          {list.length > COLLAPSED_ROWS && (
            <Collapsible open={expanded}>
              <ol className="divide-y divide-slate-800/60 border-t border-slate-800/60">{list.slice(COLLAPSED_ROWS).map(renderRow)}</ol>
            </Collapsible>
          )}
        </>
      )}
      <ShowMore expanded={expanded} total={list.length} onToggle={() => setExpanded((v) => !v)} />
    </Panel>
  );
}

import { Activity, Landmark } from 'lucide-react';
import type { MarketData, PeriodicReturnItem, RuleBreakdownItem } from '@/services/api';
import { tfLabel } from '@/lib/timeframes';
import { Eyebrow, Panel, PanelHeader, formatPct, formatPrice } from '@/components/dashboard/Panel';

/** Where today's price sits between the 52-week low and high. */
export function YearRange({ low, high, price }: { low?: number | null; high?: number | null; price: number }) {
  if (!low || !high || high <= low) return null;
  const pos = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Eyebrow className="text-slate-500">52 haftalık aralık</Eyebrow>
        <span className="font-data text-[11px] text-slate-500">zirveye uzaklık {formatPct(((price - high) / high) * 100)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-rose-500/40 via-slate-600/50 to-emerald-500/40">
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#12161f] bg-white shadow-[0_0_10px_rgba(255,255,255,0.35)]"
          style={{ left: `${pos}%` }}
          title={`₺${formatPrice(price)}`}
        />
      </div>
      <div className="flex justify-between font-data text-[11px]">
        <span className="text-slate-400">₺{formatPrice(low)}</span>
        <span className="text-slate-400">₺{formatPrice(high)}</span>
      </div>
    </div>
  );
}

export function ReturnsStrip({ items }: { items: PeriodicReturnItem[] }) {
  if (items.length === 0) return null;
  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.change_pct)));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
      {items.map((item) => {
        const up = item.change_pct >= 0;
        return (
          <div key={item.period} className="rounded-2xl border border-slate-800/80 bg-[#12161f] px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{item.label}</span>
              <span className="font-data text-[10px] text-slate-600">{item.period}</span>
            </div>
            <p className={`mt-2 font-data text-lg font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPct(item.change_pct)}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${up ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                style={{ width: `${(Math.abs(item.change_pct) / maxAbs) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SEGMENT_COLORS = ['#3b82f6', '#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#84cc16', '#f97316'];

/** The score as a 0–100 bar split into the contribution of each met rule. */
export function ScoreComposition({ rules }: { rules: RuleBreakdownItem[] }) {
  const met = rules.filter((r) => r.is_met && r.earned_score > 0);
  const total = met.reduce((sum, r) => sum + r.earned_score, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800" role="img" aria-label="Skorun kurallara göre dağılımı">
        {met.map((rule, i) => (
          <span
            key={rule.id}
            title={`${rule.name}: +${rule.earned_score}`}
            className="h-full border-r border-[#12161f] last:border-r-0"
            style={{ width: `${Math.min(100, rule.earned_score)}%`, backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
          />
        ))}
      </div>
      {met.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {met.map((rule, i) => (
            <li key={rule.id} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
              <span className="max-w-[180px] truncate">{rule.name}</span>
              <span className="font-data text-slate-300">+{rule.earned_score}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">Şu an hiçbir kural sağlanmıyor.</p>
      )}
      <p className="font-data text-[10px] text-slate-600">toplam {total.toFixed(2)} / 100</p>
    </div>
  );
}

function Stat({ label, value, hint, tone = 'text-slate-100' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="text-xs text-slate-400">
        {label}
        {hint && <span className="ml-1.5 text-[10px] text-slate-600">{hint}</span>}
      </span>
      <span className={`font-data text-sm font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function formatLarge(val?: number | null): string {
  if (!val) return '—';
  if (val >= 1_000_000_000) return `₺${(val / 1_000_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Mr`;
  if (val >= 1_000_000) return `₺${(val / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Mn`;
  return `₺${val.toLocaleString('tr-TR')}`;
}

const ratio = (v?: number | null) => (v === undefined || v === null ? '—' : v.toFixed(2));

export function FundamentalsPanel({ data }: { data: MarketData }) {
  const f = data.fundamentals ?? {};
  const freeFloat = f.free_float_pct;
  return (
    <Panel>
      <PanelHeader icon={Landmark} title="Temel göstergeler" subtitle="Günde birkaç kez güncellenir" accent="amber" />
      <div className="divide-y divide-slate-800/60 px-4">
        <Stat label="Piyasa değeri" value={formatLarge(f.market_cap)} />
        <div className="py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-400">Halka açıklık</span>
            <span className="font-data text-sm font-semibold text-cyan-300">
              {freeFloat === undefined || freeFloat === null ? '—' : `%${freeFloat.toFixed(2)}`}
            </span>
          </div>
          {freeFloat !== undefined && freeFloat !== null && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-400/70" style={{ width: `${Math.min(100, freeFloat)}%` }} />
            </div>
          )}
        </div>
        <Stat label="F/K" hint="fiyat / kazanç" value={ratio(f.pe_ratio)} tone="text-amber-200" />
        <Stat label="PD/DD" hint="piyasa / defter" value={ratio(f.pb_ratio)} tone="text-violet-300" />
        <Stat label="52H en yüksek" value={f.year_high ? `₺${formatPrice(f.year_high)}` : '—'} />
        <Stat label="52H en düşük" value={f.year_low ? `₺${formatPrice(f.year_low)}` : '—'} />
      </div>
    </Panel>
  );
}

/** Live numbers behind the primary filter on the chart's timeframe. */
export function RsiSnapshot({ data, interval }: { data: MarketData; interval: string }) {
  const pane = data.rsi_pane;
  const rsi = pane?.rsi.at(-1)?.value;
  const trend = pane?.trendline.at(-1)?.value;
  if (rsi === undefined) return null;
  const above = trend !== undefined && rsi > trend;
  const zone = rsi >= 70 ? 'aşırı alım bölgesi' : rsi <= 30 ? 'aşırı satım bölgesi' : 'nötr bölge';

  return (
    <Panel>
      <PanelHeader icon={Activity} title="RSI durumu" subtitle={`${tfLabel(interval, 'long')} grafik`} accent="blue" />
      <div className="space-y-4 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-data text-3xl font-semibold text-violet-300">{rsi.toFixed(2)}</p>
            <p className="mt-1 text-[11px] text-slate-500">RSI (14) · {zone}</p>
          </div>
          {trend !== undefined && (
            <span
              className={`rounded-md border px-2 py-1 font-data text-[10px] uppercase tracking-wider ${
                above ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/60 text-slate-400'
              }`}
            >
              {above ? 'çizginin üstünde' : 'çizginin altında'}
            </span>
          )}
        </div>
        {/* 0–100 scale with 30/70 guides, RSI and trendline markers */}
        <div className="relative h-2 rounded-full bg-slate-800">
          <span className="absolute inset-y-0 left-0 w-[30%] rounded-l-full bg-emerald-500/10" />
          <span className="absolute inset-y-0 right-0 w-[30%] rounded-r-full bg-rose-500/10" />
          {trend !== undefined && (
            <span className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-blue-400" style={{ left: `${trend}%` }} title="Trend çizgisi" />
          )}
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#12161f] bg-violet-400"
            style={{ left: `${Math.min(100, Math.max(0, rsi))}%` }}
            title="RSI"
          />
        </div>
        <div className="flex justify-between font-data text-[10px] text-slate-600">
          <span>0</span>
          <span>30</span>
          <span>70</span>
          <span>100</span>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-slate-800/70 pt-3 text-center">
          {[
            { label: 'Trend çizgisi', value: trend !== undefined ? trend.toFixed(2) : '—' },
            { label: 'İlk tepe', value: pane?.peak_rsi != null ? pane.peak_rsi.toFixed(2) : '—' },
            { label: 'Eğim', value: pane?.slope != null ? pane.slope.toFixed(3) : '—' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-[10px] text-slate-500">{s.label}</p>
              <p className="mt-0.5 font-data text-xs text-slate-200">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

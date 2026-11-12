'use client';

import { useState } from 'react';
import { Check, Flame, LineChart, Loader2, Lock, Pencil, Scale, Search, Sliders, Sparkles, Trash2 } from 'lucide-react';
import type { Rule } from '@/types';
import type { MarketData } from '@/services/api';
import ChartWrapper from '@/components/charts/ChartWrapper';
import ScoreGauge from '@/components/ui/ScoreGauge';
import { CHART_INTERVALS, CHART_PERIODS, Segmented } from '@/components/dashboard/InstrumentPanel';
import { Eyebrow, Panel, PanelHeader } from '@/components/dashboard/Panel';
import { tfLabel } from '@/lib/timeframes';
import { ruleFormula } from './ruleFormat';
import { useFeedback } from '@/components/ui/feedback';

const SEGMENT_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7'];

export function Toggle({ checked, onChange, label, tone = 'emerald' }: { checked: boolean; onChange: (v: boolean) => void; label: string; tone?: 'emerald' | 'amber' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? (tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-700'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function Formula({ rule }: { rule: Rule }) {
  const f = ruleFormula(rule);
  return (
    <code className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-[#0d1118] px-2 py-1 font-data text-[11px]">
      <span className="text-slate-200">{f.left}</span>
      <span className="text-amber-300">{f.op}</span>
      <span className="text-slate-200">{f.right}</span>
    </code>
  );
}

/** Active weights against the 100-point scale. */
export function WeightBalance({ rules }: { rules: Rule[] }) {
  const active = rules.filter((r) => r.is_active).sort((a, b) => Number(b.is_primary_filter) - Number(a.is_primary_filter));
  const total = active.reduce((sum, r) => sum + Number(r.score_impact || 0), 0);
  const scale = Math.max(100, total);
  const diff = Math.round((total - 100) * 100) / 100;
  const status =
    diff === 0
      ? { text: 'Dengeli: en yüksek skor tam 100', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' }
      : diff < 0
        ? { text: `Skor en fazla ${total.toFixed(1)} olabilir (${Math.abs(diff).toFixed(1)} eksik)`, tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' }
        : { text: `Toplam 100'ü ${diff.toFixed(1)} aşıyor, skor 100'de kesilir`, tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10' };

  return (
    <Panel>
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:gap-8">
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
            <Scale className="h-5 w-5 text-slate-300" />
          </span>
          <div>
            <Eyebrow className="text-slate-500">Ağırlık dengesi</Eyebrow>
            <p className="mt-0.5 font-data text-xl font-semibold text-slate-50">
              {total.toFixed(1)} <span className="text-sm text-slate-500">/ 100</span>
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            {active.map((r, i) => (
              <span
                key={r.id}
                title={`${r.name}: ${Number(r.score_impact).toFixed(1)}`}
                className="h-full border-r border-[#12161f] transition-[width] duration-500 last:border-r-0"
                style={{ width: `${(Number(r.score_impact) / scale) * 100}%`, backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
              />
            ))}
            {total > 100 && <span className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${(100 / scale) * 100}%` }} />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`rounded-md border px-2 py-0.5 text-[11px] ${status.tone}`}>{status.text}</span>
            <span className="font-data text-[11px] text-slate-500">{active.length} aktif kural</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function PrimaryFilterCard({ rule, onEdit, onToggle }: { rule: Rule; onEdit: (r: Rule) => void; onToggle: (id: number, v: boolean) => void }) {
  const p = rule.indicator_2_params ?? {};
  const stats = [
    { label: 'Zaman dilimi', value: tfLabel(rule.timeframe, 'badge') },
    { label: 'Trend ucu', value: `≤ ${p.max_trend_end ?? 30}` },
    { label: 'Min. tepe', value: `${p.min_peak ?? 55}` },
    { label: 'Geriye bakış', value: `${p.lookback ?? 60} bar` },
  ];

  return (
    <Panel className="relative border-amber-500/25">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
              <Flame className="h-4 w-4 text-amber-400" />
            </span>
            <div>
              <Eyebrow className="text-amber-300">Ana filtre</Eyebrow>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                <Lock className="h-3 w-3" /> Çekirdek kural · silinemez
              </p>
            </div>
          </div>
          <Toggle checked={rule.is_active} onChange={(v) => onToggle(rule.id, v)} label={rule.is_active ? 'Ana filtreyi pasife al' : 'Ana filtreyi aktifleştir'} tone="amber" />
        </div>

        <div>
          <p className={`text-base font-semibold ${rule.is_active ? 'text-slate-100' : 'text-slate-500 line-through'}`}>{rule.name}</p>
          {rule.description && rule.description !== rule.name && <p className="mt-1 text-xs leading-relaxed text-slate-400">{rule.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-800 bg-[#0d1118] px-3 py-2">
              <p className="text-[10px] text-slate-500">{s.label}</p>
              <p className="mt-0.5 font-data text-sm font-semibold text-amber-200">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
          <span className="font-data text-xs text-slate-400">
            Skora katkı <span className="text-emerald-300">+{Number(rule.score_impact).toFixed(1)}</span>
          </span>
          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
          >
            <Pencil className="h-3.5 w-3.5" /> Parametreleri düzenle
          </button>
        </div>
      </div>
    </Panel>
  );
}

export function ScoringRules({
  rules,
  onEdit,
  onToggle,
  onDelete,
  onSeed,
  seeding,
}: {
  rules: Rule[];
  onEdit: (r: Rule) => void;
  onToggle: (id: number, v: boolean) => void;
  onDelete: (ids: number[]) => Promise<void>;
  onSeed: () => void;
  seeding: boolean;
}) {
  const { confirm } = useFeedback();
  const [selected, setSelected] = useState<number[]>([]);
  // Drop selections of rules that no longer exist (e.g. after a delete elsewhere)
  const liveSelected = selected.filter((id) => rules.some((r) => r.id === id));
  const allSelected = rules.length > 0 && liveSelected.length === rules.length;

  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const askDelete = async (ids: number[]) => {
    const ok = await confirm({
      title: ids.length > 1 ? `${ids.length} kural silinsin mi?` : 'Kural silinsin mi?',
      message: 'Silinen kurallar skordan hemen düşer ve geri alınamaz. Geçici olarak devre dışı bırakmak için anahtarı kullanabilirsiniz.',
      confirmLabel: 'Sil',
      tone: 'danger',
    });
    if (!ok) return;
    await onDelete(ids);
    setSelected((prev) => prev.filter((id) => !ids.includes(id)));
  };

  return (
    <Panel>
      <PanelHeader
        icon={Sliders}
        title="Puanlama kuralları"
        subtitle="Ana filtreden sonra skoru oluşturan kurallar"
        accent="blue"
        count={rules.length}
        right={
          rules.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {liveSelected.length > 0 && (
                <button
                  type="button"
                  onClick={() => askDelete(liveSelected)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {liveSelected.length} sil
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(allSelected ? [] : rules.map((r) => r.id))}
                className="cursor-pointer rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-800"
              >
                {allSelected ? 'Seçimi kaldır' : 'Tümünü seç'}
              </button>
            </div>
          ) : undefined
        }
      />

      {rules.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10">
            <Sparkles className="h-6 w-6 text-blue-400" />
          </span>
          <div>
            <p className="font-medium text-slate-200">Henüz puanlama kuralı yok</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
              Danışmanın önerdiği varsayılan kural setini yükleyebilir ya da üstteki butonla kendi kuralınızı tanımlayabilirsiniz.
            </p>
          </div>
          <button
            type="button"
            onClick={onSeed}
            disabled={seeding}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-500/20 disabled:opacity-60"
          >
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Varsayılan kural setini yükle
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-slate-800/60">
          {rules.map((rule) => {
            const isSelected = liveSelected.includes(rule.id);
            return (
              <li key={rule.id} className={`group flex items-start gap-3 px-4 py-3.5 transition-colors ${isSelected ? 'bg-blue-500/[0.06]' : 'hover:bg-slate-800/20'}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={`${rule.name} seç`}
                  onClick={() => toggle(rule.id)}
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded border transition-colors ${
                    isSelected ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-600 bg-slate-900 text-transparent hover:border-slate-400'
                  }`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <div className="pt-px">
                  <Toggle checked={rule.is_active} onChange={(v) => onToggle(rule.id, v)} label={rule.is_active ? 'Kuralı devre dışı bırak' : 'Kuralı aktifleştir'} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-medium ${rule.is_active ? 'text-slate-100' : 'text-slate-500 line-through'}`}>{rule.name}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-data text-[10px] text-slate-400">{tfLabel(rule.timeframe)}</span>
                  </div>
                  <Formula rule={rule} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`font-data text-sm font-semibold ${rule.is_active ? 'text-blue-300' : 'text-slate-600'}`}>
                    +{Number(rule.score_impact).toFixed(1)}
                  </span>
                  <div className="flex gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onEdit(rule)}
                      title="Düzenle"
                      aria-label={`${rule.name} düzenle`}
                      className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-500/15 hover:text-blue-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => askDelete([rule.id])}
                      title="Sil"
                      aria-label={`${rule.name} sil`}
                      className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function RulePreview({
  universe,
  symbol,
  onSymbol,
  config,
  onConfig,
  data,
  loading,
}: {
  universe: { symbol: string; name: string }[];
  symbol: string;
  onSymbol: (s: string) => void;
  config: { interval: string; period: string };
  onConfig: (c: { interval: string; period: string }) => void;
  data: MarketData | null;
  loading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const matches = (q ? universe.filter((u) => u.symbol.toLocaleLowerCase('tr-TR').includes(q) || u.name.toLocaleLowerCase('tr-TR').includes(q)) : universe).slice(0, 40);
  const name = universe.find((u) => u.symbol === symbol)?.name;
  const rules = data?.rules_breakdown ?? [];
  const met = rules.filter((r) => r.is_met).length;

  return (
    <Panel>
      <PanelHeader icon={LineChart} title="Canlı önizleme" subtitle="Kuralları gerçek bir hisse üzerinde deneyin" accent="blue" />

      <div className="flex flex-col gap-4 border-b border-slate-800/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder={`${symbol}${name ? ` · ${name}` : ''}`}
            aria-label="Önizleme hissesi"
            className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {open && (
            <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-800 bg-[#12161f] p-1 shadow-2xl">
              {matches.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-slate-500">Hisse bulunamadı.</p>
              ) : (
                matches.map((u) => (
                  <button
                    key={u.symbol}
                    type="button"
                    onMouseDown={() => {
                      onSymbol(u.symbol);
                      setQuery('');
                      setOpen(false);
                    }}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      u.symbol === symbol ? 'bg-blue-500/15 text-blue-200' : 'text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="font-data text-sm font-semibold">{u.symbol}</span>
                    <span className="truncate text-[11px] text-slate-500">{u.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {data && !loading && (
          <div className="flex items-center gap-3">
            <ScoreGauge score={data.score} size="sm" />
            <div className="text-xs">
              <p className="font-data text-slate-200">
                {met}/{rules.length} kural
              </p>
              <p className={data.primary_filter_passed ? 'text-emerald-400' : 'text-slate-500'}>
                {data.primary_filter_passed ? 'Ana filtre geçti' : 'Ana filtre geçmedi'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2 border-b border-slate-800/80 px-4 py-3 md:grid-cols-2 md:gap-4">
        <Segmented label="Mum" options={CHART_INTERVALS} value={config.interval} onChange={(v) => onConfig({ ...config, interval: v })} />
        <Segmented label="Aralık" options={CHART_PERIODS} value={config.period} onChange={(v) => onConfig({ ...config, period: v })} />
      </div>

      <div className="px-2 pb-2 pt-3 sm:px-3">
        {loading ? (
          <div className="flex h-[505px] items-center justify-center gap-2 font-data text-xs text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> {symbol} hesaplanıyor
          </div>
        ) : data?.candles?.length ? (
          <ChartWrapper key={`${symbol}-${config.interval}-${config.period}`} candles={data.candles} indicators={data.indicators} rsiPane={data.rsi_pane} height={340} />
        ) : (
          <div className="flex h-[505px] items-center justify-center text-sm text-slate-500">Grafik verisi bulunamadı.</div>
        )}
      </div>
    </Panel>
  );
}

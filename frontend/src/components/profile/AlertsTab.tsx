import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, Loader2, Pause, Play, Trash2, Zap } from 'lucide-react';
import type { CustomAlert, StockOverviewItem } from '@/services/api';
import type { Rule } from '@/types';
import { EmptyRow, Eyebrow, Panel, PanelHeader, formatPrice } from '@/components/dashboard/Panel';
import { Segmented } from '@/components/dashboard/InstrumentPanel';
import { ruleFormula } from '@/components/admin/ruleFormat';
import { tfLabel } from '@/lib/timeframes';
import { formatDateTime, relativeTime } from '@/lib/time';

type View = 'all' | 'active' | 'paused';

// Alerts created before rule-based alerts existed have no rule id
const LEGACY_RULE_NAME = 'RSI düşen trend kırılımı';

function AlertCard({
  alert,
  rule,
  stock,
  busy,
  onToggle,
  onDelete,
}: {
  alert: CustomAlert;
  rule?: Rule;
  stock?: StockOverviewItem;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const formula = rule ? ruleFormula(rule) : null;
  const paused = !alert.is_active;

  return (
    <li
      className={`flex flex-col rounded-xl border bg-[#0d1118] transition-colors ${
        paused ? 'border-slate-800/70 opacity-70' : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-3.5 pb-3">
        <div className="min-w-0">
          <Link href={`/detay/${alert.symbol}`} className="font-data text-sm font-semibold text-slate-100 hover:text-blue-400">
            {alert.symbol}
          </Link>
          <p className="truncate text-[11px] text-slate-500">{stock?.name ?? '—'}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            paused ? 'border-slate-700 text-slate-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-slate-500' : 'bg-emerald-400'}`} />
          {paused ? 'Duraklatıldı' : 'Aktif'}
        </span>
      </div>

      <div className="mx-3.5 rounded-lg border border-slate-800/80 bg-[#12161f]/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium text-slate-200">{rule?.name ?? LEGACY_RULE_NAME}</p>
          <span className="shrink-0 rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 font-data text-[10px] text-amber-300">
            {tfLabel(alert.timeframe, 'badge')}
          </span>
        </div>
        {formula && (
          <p className="mt-1.5 truncate font-data text-[11px] text-slate-500">
            {formula.left} <span className="text-blue-400">{formula.op}</span> {formula.right}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 px-3.5 py-3 text-[11px]">
        <div>
          <dt className="text-slate-600">Son tetiklenme</dt>
          <dd className={`mt-0.5 font-data ${alert.last_triggered_at ? 'text-emerald-300' : 'text-slate-500'}`} title={formatDateTime(alert.last_triggered_at)}>
            {relativeTime(alert.last_triggered_at, 'Henüz yok')}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-slate-600">Güncel</dt>
          <dd className="mt-0.5 font-data text-slate-300">
            {stock ? (
              <>
                ₺{formatPrice(stock.current_price)} <span className="text-slate-500">· {stock.score.toFixed(0)}</span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-800/80 px-3.5 py-2.5">
        <span className="font-data text-[10px] text-slate-600" title={formatDateTime(alert.created_at)}>
          kuruldu {relativeTime(alert.created_at).toLocaleLowerCase('tr-TR')}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? 'Sürdür' : 'Duraklat'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label={`${alert.symbol} alarmını sil`}
            title="Sil"
            className="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

export default function AlertsTab({
  alerts,
  rules,
  market,
  busyId,
  onToggle,
  onDelete,
}: {
  alerts: CustomAlert[];
  rules: Record<number, Rule>;
  market: Record<string, StockOverviewItem>;
  busyId: number | null;
  onToggle: (alert: CustomAlert) => void;
  onDelete: (alert: CustomAlert) => void;
}) {
  const [view, setView] = useState<View>('all');
  const active = alerts.filter((a) => a.is_active).length;
  const visible = alerts.filter((a) => (view === 'all' ? true : view === 'active' ? a.is_active : !a.is_active));

  return (
    <Panel>
      <PanelHeader
        icon={Bell}
        title="Alarmlarım"
        subtitle="Koşul sağlandığında bildirim zili ve e-posta ile haber verilir (seans saatlerinde)"
        accent="blue"
        count={alerts.length}
      />
      {alerts.length === 0 ? (
        <EmptyRow>
          Henüz alarm kurmadın. Hisse detay sayfasındaki <span className="text-slate-300">“Alarm kur”</span> düğmesiyle istediğin kural
          için alarm oluşturabilirsin.
          <span className="mt-3 block">
            <Link href="/ana-sayfa" className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300">
              Hisseleri incele <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </span>
        </EmptyRow>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-slate-800/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-[400px]">
              <Segmented
                label="Durum"
                value={view}
                onChange={(v) => setView(v as View)}
                options={[
                  { value: 'all', label: `Tümü ${alerts.length}` },
                  { value: 'active', label: `Aktif ${active}` },
                  { value: 'paused', label: `Duraklatılan ${alerts.length - active}` },
                ]}
              />
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <Eyebrow className="text-slate-500">Tetiklenen</Eyebrow>
              <span className="font-data text-slate-300">{alerts.filter((a) => a.last_triggered_at).length}</span>
            </p>
          </div>
          {visible.length === 0 ? (
            <EmptyRow>Bu filtrede alarm yok.</EmptyRow>
          ) : (
            <ul className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((a) => (
                <AlertCard
                  key={a.id}
                  alert={a}
                  rule={a.rule_id ? rules[a.rule_id] : undefined}
                  stock={market[a.symbol]}
                  busy={busyId === a.id}
                  onToggle={() => onToggle(a)}
                  onDelete={() => onDelete(a)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

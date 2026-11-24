import { Check, Clock3, Minus, X } from 'lucide-react';
import type { MarketData } from '@/services/api';
import { tfLabel } from '@/lib/timeframes';
import { confirmWindowText, formatBarTime, formatUnix } from '@/lib/primaryFilter';

type StepState = 'done' | 'waiting' | 'failed' | 'off';

const STEP_TONES: Record<StepState, { icon: typeof Check; ring: string; text: string }> = {
  done: { icon: Check, ring: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300', text: 'text-emerald-300' },
  waiting: { icon: Clock3, ring: 'border-amber-500/40 bg-amber-500/15 text-amber-300', text: 'text-amber-300' },
  failed: { icon: X, ring: 'border-slate-700 bg-slate-800/60 text-slate-500', text: 'text-slate-400' },
  off: { icon: Minus, ring: 'border-slate-700 bg-slate-800/60 text-slate-500', text: 'text-slate-500' },
};

const price = (v: number | null | undefined) =>
  v == null ? '—' : `₺${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Step({ index, title, state, status, detail }: { index: number; title: string; state: StepState; status: string; detail?: string }) {
  const tone = STEP_TONES[state];
  const Icon = tone.icon;
  return (
    <li className="flex gap-3 rounded-lg border border-slate-800/80 bg-[#0d1118] p-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${tone.ring}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs text-slate-300">
          <span className="font-data text-[10px] text-slate-500">{index}. adım · </span>
          {title}
        </p>
        <p className={`text-xs font-medium ${tone.text}`}>{status}</p>
        {detail && <p className="font-data text-[11px] leading-relaxed text-slate-500">{detail}</p>}
      </div>
    </li>
  );
}

/** Both steps of the primary filter for one stock: RSI breakout, then the 5m average confirmation. */
export default function PrimarySteps({ data, className = '' }: { data: MarketData; className?: string }) {
  if (!data.has_primary_filter) return null;
  const tf = data.primary_filter_timeframe ?? '4h';
  const primaryRow = data.rules_breakdown?.find((r) => r.is_primary_filter);
  const confirm = data.primary_confirm;
  const rsiNow = !!(data.primary_rsi_passed ?? primaryRow?.is_met);
  const armed = !!confirm?.armed_at;

  // Step 1: the RSI breakout (stays "done" while the stock is armed, even if RSI moved on since)
  let rsiState: StepState = 'failed';
  let rsiStatus = 'Kırılım yok';
  let rsiDetail: string | undefined;
  if (rsiNow) {
    rsiState = 'done';
    rsiStatus = primaryRow?.stage === 'near' ? 'Kesmeye yakın (erken sinyal)' : 'RSI düşen trend çizgisini kırdı';
  } else if (armed) {
    rsiState = 'done';
    rsiStatus = 'Sinyal geldi';
  }
  if (armed) rsiDetail = `Sinyal: ${formatUnix(confirm!.armed_at)}${confirm!.rsi_price != null ? ` · ${price(confirm!.rsi_price)}` : ''}`;

  // Step 2: a closed 5m bar above its MA(N), within the waiting window
  let maState: StepState = 'off';
  let maStatus = 'İkinci adım kapalı';
  let maDetail: string | undefined;
  if (confirm) {
    const last =
      confirm.last_close != null && confirm.average != null
        ? `Son kapanan mum (${formatBarTime(confirm.last_bar)}): ${price(confirm.last_close)} · ${confirm.label} ${price(confirm.average)}`
        : undefined;
    if (confirm.confirmed_at) {
      maState = 'done';
      maStatus = `${formatBarTime(confirm.confirm_bar)} mumu ortalamanın üstünde kapandı`;
      maDetail = `Kapanış ${price(confirm.confirm_close)} > ${confirm.label} ${price(confirm.confirm_average)} · sinyal ${formatUnix(confirm.deadline)} tarihine kadar listede`;
    } else if (armed) {
      maState = 'waiting';
      maStatus = `Bekleniyor · son tarih ${formatUnix(confirm.deadline)}`;
      maDetail = last;
    } else {
      maState = 'failed';
      maStatus = 'RSI sinyalinden sonra kontrol edilir';
      maDetail = last;
    }
  }

  return (
    <div className={className}>
      <ul className="grid gap-2 sm:grid-cols-2">
        <Step index={1} title={`RSI kırılımı · ${tfLabel(tf)}`} state={rsiState} status={rsiStatus} detail={rsiDetail} />
        <Step
          index={2}
          title={confirm ? `${confirm.label} teyidi · ${confirmWindowText(confirm.window_sessions)}` : 'Ortalama teyidi'}
          state={maState}
          status={maStatus}
          detail={maDetail}
        />
      </ul>
    </div>
  );
}

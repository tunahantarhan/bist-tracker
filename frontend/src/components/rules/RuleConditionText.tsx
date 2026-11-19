import { RuleBreakdownItem } from '@/services/api';
import { RuleParams } from '@/types';

// Human-readable explanation of a rule evaluation, e.g. "RSI(14) 32.75 > Trend çizgisi 30.10 → Sağlanıyor"

const OPERATOR_TEXT: Record<string, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '==': '=',
  crosses_above: 'yukarı kesti',
  crosses_below: 'aşağı kesti',
};

type Params = RuleParams | null | undefined;

function indicatorLabel(name?: string | null, params?: Params): string {
  if (!name) return 'Değer';
  const ind = name.toUpperCase();
  const len = params?.length ?? params?.period;
  switch (ind) {
    case 'PRICE': return 'Fiyat';
    case 'RSI': return `RSI(${len ?? 14})`;
    case 'RSI_TRENDLINE': return 'Trend çizgisi';
    case 'SMA':
    case 'MA': return `MA(${len ?? 50})`;
    case 'EMA': return `EMA(${len ?? 50})`;
    case 'STOCH_RSI':
    case 'STOCH_RSI_K': return 'Stoch %K';
    case 'STOCH_RSI_D': return 'Stoch %D';
    case 'MACD':
    case 'MACD_LINE': return 'MACD';
    case 'MACD_SIGNAL': return 'Sinyal';
    case 'MACD_HIST': return 'MACD Hist.';
    case 'BOLLINGER_UPPER':
    case 'BB_UPPER': return 'BB Üst';
    case 'BOLLINGER_MIDDLE':
    case 'BB_MIDDLE': return 'BB Orta';
    case 'BOLLINGER_LOWER':
    case 'BB_LOWER': return 'BB Alt';
    default: return ind;
  }
}

const fmt = (v?: number | null) => (v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v).toFixed(2));

const isTrendlineRule = (rule: RuleBreakdownItem) => rule.indicator_2?.toUpperCase() === 'RSI_TRENDLINE';

function Verdict({ ok }: { ok: boolean }) {
  return (
    <strong className={ok ? 'text-emerald-400' : 'text-rose-400/90'}>
      {ok ? 'Sağlanıyor' : 'Sağlanmıyor'}
    </strong>
  );
}

function TrendlineChecks({ rule }: { rule: RuleBreakdownItem }) {
  const c = rule.trend_checks!;
  const p = rule.indicator_2_params ?? {};
  const items: { ok: boolean; label: string }[] = [
    { ok: c.peak, label: `Ana tepe ≥ ${p.min_peak ?? 55}${rule.peak_rsi != null ? ` (tepe ${fmt(rule.peak_rsi)})` : ''}` },
    { ok: c.second_peak, label: 'Düşen trendi çizen ikinci tepe oluştu' },
    { ok: c.rising_break, label: 'RSI çizgiyi yükselerek kesti' },
    {
      ok: c.low_break,
      label: `Kırılım dip bölgede (çizgi ≤ ${p.max_trend_end ?? 30}${rule.line_at_break != null ? `, ${fmt(rule.line_at_break)}` : ''})`,
    },
    { ok: c.confirmed && c.fresh, label: `Kırılım onaylı ve taze${rule.break_bars_ago != null ? ` (${rule.break_bars_ago} mum önce)` : ''}` },
  ];
  // stop at the first failing check: later ones depend on it
  const firstFail = items.findIndex((i) => !i.ok);
  const shown = firstFail === -1 ? items : items.slice(0, firstFail + 1);
  return (
    <>
      {shown.map((i) => (
        <span key={i.label}>
          {i.label}: <Verdict ok={i.ok} />
        </span>
      ))}
    </>
  );
}

export default function RuleConditionText({ rule }: { rule: RuleBreakdownItem }) {
  if (rule.error) {
    return <span className="text-amber-400/80">Hesaplanamadı (yetersiz veri)</span>;
  }

  const cur = fmt(rule.current_value);
  const target = fmt(rule.target_value);
  if (cur === null || target === null) {
    return <span className="text-slate-500">Şart durumu izleniyor</span>;
  }

  if (isTrendlineRule(rule) && rule.trend_checks && !rule.trend_checks.second_peak) {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span>
          RSI <strong className="text-slate-200">{cur}</strong> · düşen trend çizgisi henüz yok
        </span>
        <TrendlineChecks rule={rule} />
      </span>
    );
  }

  const op = OPERATOR_TEXT[rule.condition || '>'] ?? rule.condition;
  const left = indicatorLabel(rule.indicator_1, rule.indicator_1_params);
  const right = rule.target_type === 'static' ? '' : indicatorLabel(rule.indicator_2, rule.indicator_2_params);

  const isTrendline = rule.indicator_2?.toUpperCase() === 'RSI_TRENDLINE';
  const maxTrendEnd = Number(rule.indicator_2_params?.max_trend_end ?? 30);
  const minPeak = Number(rule.indicator_2_params?.min_peak ?? 55);

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span>
        {left} <strong className="text-slate-200">{cur}</strong>{' '}
        <span className="text-slate-500">{op}</span>{' '}
        {right && <>{right} </>}<strong className="text-slate-200">{target}</strong>
        {!isTrendline && <> → <Verdict ok={rule.is_met} /></>}
      </span>
      {isTrendline && rule.trend_checks && <TrendlineChecks rule={rule} />}
      {isTrendline && !rule.trend_checks && (
        <>
          <span>
            Kırılım (RSI trendin üstünde): <Verdict ok={Number(rule.current_value) > Number(rule.target_value)} />
          </span>
          <span>
            Trend ucu ≤ {maxTrendEnd} ve tepe ≥ {minPeak}
            {rule.peak_rsi != null && <> (tepe {fmt(rule.peak_rsi)})</>}: <Verdict ok={rule.peak_qualifies !== false} />
          </span>
        </>
      )}
    </span>
  );
}

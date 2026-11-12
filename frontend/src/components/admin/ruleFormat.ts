import type { Rule, RuleParams } from '@/types';

const INDICATOR_LABELS: Record<string, string> = {
  RSI: 'RSI',
  RSI_TRENDLINE: 'RSI trend',
  SMA: 'MA',
  MA: 'MA',
  EMA: 'EMA',
  STOCH_RSI: 'Stoch %K',
  STOCH_RSI_K: 'Stoch %K',
  STOCH_RSI_D: 'Stoch %D',
  MACD: 'MACD',
  MACD_LINE: 'MACD',
  MACD_SIGNAL: 'MACD sinyal',
  MACD_HIST: 'MACD hist.',
  BOLLINGER_UPPER: 'BB üst',
  BOLLINGER_MIDDLE: 'BB orta',
  BOLLINGER_LOWER: 'BB alt',
  BB_UPPER: 'BB üst',
  BB_MIDDLE: 'BB orta',
  BB_LOWER: 'BB alt',
  PRICE: 'Fiyat',
};

const CONDITION_LABELS: Record<string, string> = {
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
  '==': '=',
  crosses_above: '↗ keser',
  crosses_below: '↘ keser',
};

function paramText(indicator: string, params?: RuleParams | null): string {
  if (!params) return '';
  const ind = indicator.toUpperCase();
  let values: (number | undefined)[] = [];
  if (ind.startsWith('STOCH')) values = [params.length, params.rsi_length, params.k, params.d];
  else if (ind.startsWith('MACD')) values = [params.fast, params.slow, params.signal];
  else if (ind.startsWith('BOLLINGER') || ind.startsWith('BB_')) values = [params.length, params.std_dev];
  else if (ind === 'PRICE') values = [];
  else values = [params.length ?? params.period];
  const shown = values.filter((v) => v !== undefined && v !== null);
  return shown.length ? `(${shown.join(',')})` : '';
}

export function indicatorText(indicator: string | null | undefined, params?: RuleParams | null): string {
  if (!indicator) return '';
  return `${INDICATOR_LABELS[indicator.toUpperCase()] ?? indicator}${paramText(indicator, params)}`;
}

/** Compact one-line formula, e.g. "MA(21) > MA(50)" or "RSI(14) ↗ keser 30". */
export function ruleFormula(rule: Rule): { left: string; op: string; right: string } {
  return {
    left: indicatorText(rule.indicator_1, rule.indicator_1_params),
    op: CONDITION_LABELS[rule.condition] ?? rule.condition,
    right: rule.target_type === 'static' ? String(rule.static_value ?? '') : indicatorText(rule.indicator_2, rule.indicator_2_params),
  };
}

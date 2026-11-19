import type { PrimaryConfirm } from '@/services/api';

type PrimaryState = {
  primary_filter_passed?: boolean;
  primary_rsi_passed?: boolean;
  primary_confirm?: PrimaryConfirm | null;
};

/** Badge text/tone of the primary filter, including the "waiting for the average" step. */
export function primaryFilterBadge(data: PrimaryState): { label: string; tone: 'passed' | 'waiting' | 'idle' } {
  if (data.primary_filter_passed) return { label: 'Ana filtre geçti', tone: 'passed' };
  const confirm = data.primary_confirm;
  if (confirm && (confirm.armed_at || data.primary_rsi_passed)) {
    return { label: `RSI sağlandı · ${confirm.days}G ort. bekleniyor`, tone: 'waiting' };
  }
  return { label: 'Ana filtre bekleniyor', tone: 'idle' };
}

export const PRIMARY_BADGE_TONES = {
  passed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  waiting: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  idle: 'border-slate-700 bg-slate-800/50 text-slate-400',
} as const;

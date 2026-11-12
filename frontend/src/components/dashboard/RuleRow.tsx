import { Check, X } from 'lucide-react';
import type { RuleBreakdownItem } from '@/services/api';
import RuleConditionText from '@/components/rules/RuleConditionText';
import { tfLabel } from '@/lib/timeframes';

/** One rule of the score breakdown: met/unmet, timeframe, live condition and points. */
export default function RuleRow({ rule }: { rule: RuleBreakdownItem }) {
  return (
    <li
      className={`rounded-xl border p-3.5 ${rule.is_met ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-slate-800 bg-slate-900/30'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2.5">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
              rule.is_met ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'
            }`}
          >
            {rule.is_met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className={`text-sm ${rule.is_met ? 'text-slate-100' : 'text-slate-400'}`}>
              {rule.name}
              {rule.is_primary_filter && (
                <span className="ml-2 rounded bg-blue-500/15 px-1.5 py-0.5 align-middle font-data text-[9px] uppercase tracking-wider text-blue-300">
                  ana filtre
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 font-data text-[10px] text-slate-400">
              <span className="rounded bg-slate-800/80 px-1.5 py-0.5">{tfLabel(rule.timeframe)}</span>
              <RuleConditionText rule={rule} />
            </div>
          </div>
        </div>
        <span className={`shrink-0 font-data text-sm ${rule.is_met ? 'text-emerald-400' : 'text-slate-600'}`}>
          {rule.is_met ? `+${rule.earned_score.toFixed(1)}` : `0/${rule.score_impact}`}
        </span>
      </div>
    </li>
  );
}

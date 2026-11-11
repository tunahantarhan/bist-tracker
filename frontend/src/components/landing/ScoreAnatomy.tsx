import { Check, X } from 'lucide-react';
import ScoreGauge from '@/components/ui/ScoreGauge';

// Schematic example based on the default rule suite (weights add up to 100). Not market data.
const EXAMPLE_RULES = [
  { name: 'RSI (14) düşen trend kırılımı', tf: '4S', points: 25, met: true, primary: true },
  { name: 'Stoch RSI %K > %D', tf: '4S', points: 10, met: true },
  { name: 'MACD çizgisi > sinyal', tf: '4S', points: 10, met: false },
  { name: 'MA (9) > MA (14)', tf: '15Dk', points: 10, met: true },
  { name: 'MA (21) > MA (50)', tf: '4S', points: 12.5, met: true },
  { name: 'MA (100) > MA (200)', tf: '1G', points: 12.5, met: false },
  { name: 'Bollinger orta bant üzeri', tf: '4S', points: 10, met: false },
  { name: 'Bollinger alt bant desteği', tf: '4S', points: 10, met: true },
];

const TOTAL = EXAMPLE_RULES.reduce((sum, r) => sum + (r.met ? r.points : 0), 0);

export default function ScoreAnatomy() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#12161f]">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <p className="font-data text-[11px] uppercase tracking-[0.16em] text-slate-500">Kural karnesi</p>
          <p className="mt-1 text-sm text-slate-300">Her satır bir kural, her kuralın sabit bir ağırlığı var.</p>
        </div>
        <span className="rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-slate-400">
          örnek
        </span>
      </div>

      <ul className="divide-y divide-slate-800/70">
        {EXAMPLE_RULES.map((rule) => (
          <li key={rule.name} className="flex items-center gap-3 px-5 py-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                rule.met ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {rule.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm ${rule.met ? 'text-slate-200' : 'text-slate-500'}`}>
              {rule.name}
              {rule.primary && (
                <span className="ml-2 rounded bg-blue-500/15 px-1.5 py-0.5 align-middle font-data text-[9px] uppercase tracking-wider text-blue-300">
                  ana filtre
                </span>
              )}
            </span>
            <span className="hidden w-10 text-right font-data text-[11px] text-slate-500 sm:block">{rule.tf}</span>
            <span className={`w-14 text-right font-data text-sm ${rule.met ? 'text-emerald-400' : 'text-slate-600'}`}>
              {rule.met ? `+${rule.points.toFixed(1)}` : '0.0'}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-4 border-t border-slate-800 bg-slate-900/40 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-slate-200">Algoritmik Güven Skoru</p>
          <p className="mt-0.5 font-data text-[11px] text-slate-500">
            karşılanan kuralların ağırlık toplamı = {TOTAL.toFixed(2)}
          </p>
        </div>
        <ScoreGauge score={TOTAL} size="md" showDecimals />
      </div>
    </div>
  );
}

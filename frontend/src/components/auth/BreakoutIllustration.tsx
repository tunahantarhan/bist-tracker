/**
 * Illustration of the primary filter: RSI makes lower highs (touching a descending
 * trendline), bottoms out, then breaks above the line. Purely schematic, no market data.
 *
 * Coordinates: x 0..400, y 0..220 where y = 220 - RSI * 2.2 (RSI 70 -> 66, RSI 30 -> 154).
 */

// Trendline through the three falling peaks: y = 40 + 0.345 * (x - 40)
const TREND_START = { x: 40, y: 40 };
const TREND_END = { x: 392, y: 161.4 };
const PEAKS = [
  { x: 40, y: 40 },
  { x: 150, y: 78 },
  { x: 250, y: 112.5 },
];
const RSI_POINTS = '0,118 40,40 82,136 150,78 196,162 250,112.5 302,178 340,150 368,96 396,74';
// Where the RSI segment 340,150 -> 368,96 crosses the trendline
const BREAKOUT = { x: 342.6, y: 144.9 };

export default function BreakoutIllustration({ accent = 'blue' }: { accent?: 'blue' | 'emerald' }) {
  const lineClass = accent === 'emerald' ? 'stroke-emerald-400' : 'stroke-blue-400';

  return (
    <figure className="w-full">
      <svg viewBox="0 0 400 220" className="h-auto w-full overflow-visible" role="img" aria-label="RSI düşen trend çizgisini yukarı kırıyor (şematik)">
        {/* Overbought / oversold guides */}
        {[
          { y: 66, label: '70' },
          { y: 154, label: '30' },
        ].map((g) => (
          <g key={g.label}>
            <line x1="0" x2="400" y1={g.y} y2={g.y} className="stroke-slate-700/70" strokeWidth="1" strokeDasharray="1 5" />
            <text x="404" y={g.y + 3.5} className="fill-slate-600 font-data text-[10px]">
              {g.label}
            </text>
          </g>
        ))}

        {/* Descending trendline */}
        <line
          x1={TREND_START.x}
          y1={TREND_START.y}
          x2={TREND_END.x}
          y2={TREND_END.y}
          className="stroke-slate-400/70 animate-fade-up"
          strokeWidth="1.5"
          strokeDasharray="6 5"
          style={{ ['--fade-delay' as string]: '0.2s' }}
        />
        {PEAKS.map((p, i) => (
          <circle
            key={p.x}
            cx={p.x}
            cy={p.y}
            r="3.5"
            className="fill-[#12161f] stroke-slate-400 animate-fade-up"
            strokeWidth="1.5"
            style={{ ['--fade-delay' as string]: `${0.5 + i * 0.35}s` }}
          />
        ))}

        {/* RSI */}
        <polyline
          points={RSI_POINTS}
          fill="none"
          className={`${lineClass} animate-draw-line`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1000}
          style={{ ['--draw-delay' as string]: '0.3s', ['--draw-duration' as string]: '2.4s' }}
        />

        {/* Breakout marker */}
        <g className="animate-fade-up" style={{ ['--fade-delay' as string]: '2.5s' }}>
          <circle cx={BREAKOUT.x} cy={BREAKOUT.y} r="6" className="fill-emerald-400/40 animate-breakout-pulse" />
          <circle cx={BREAKOUT.x} cy={BREAKOUT.y} r="4" className="fill-emerald-400" />
          <text x={BREAKOUT.x + 14} y={BREAKOUT.y + 32} textAnchor="start" className="fill-emerald-300 font-data text-[11px] font-semibold">
            KIRILIM
          </text>
        </g>
      </svg>
      <figcaption className="mt-3 flex items-center gap-2 font-data text-[11px] text-slate-500">
        <span className="inline-block h-px w-5 border-t border-dashed border-slate-400" />
        düşen trend
        <span className={`ml-3 inline-block h-0.5 w-5 rounded ${accent === 'emerald' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
        RSI (14)
        <span className="ml-auto text-slate-600">şematik</span>
      </figcaption>
    </figure>
  );
}

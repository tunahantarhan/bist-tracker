'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import {
  createChart, ColorType, CandlestickSeries, LineSeries,
  IChartApi, ISeriesApi, LogicalRange, UTCTimestamp,
} from 'lightweight-charts';
import { Candle, IndicatorOverlay, RsiPaneData } from '@/services/api';
import { Eye, EyeOff } from 'lucide-react';

interface ChartWrapperProps {
  candles: Candle[];
  indicators?: IndicatorOverlay[];
  rsiPane?: RsiPaneData;
  height?: number;
  headerAction?: ReactNode; // Optional slot for alert dropdowns or extra controls
}

interface ChartRefs {
  mainChart: IChartApi;
  candleSeries: ISeriesApi<'Candlestick'>;
  indicatorSeries: Record<string, ISeriesApi<'Line'>>;
  rsiChart: IChartApi | null;
  rsiSeries: ISeriesApi<'Line'> | null;
  trendSeries: ISeriesApi<'Line'> | null;
}

// Turkey Standard Time offset (UTC+3)
const TRT_OFFSET_SECONDS = 3 * 3600;
// The first N overlays are visible by default
const DEFAULT_VISIBLE_OVERLAYS = 2;

const CHART_THEME = {
  layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8' },
  crosshair: { vertLine: { color: '#64748b', width: 1 as const, style: 3 }, horzLine: { color: '#64748b', width: 1 as const, style: 3 } },
  timeScale: { borderColor: 'rgba(30, 41, 59, 0.8)', timeVisible: true, secondsVisible: false },
  rightPriceScale: { borderColor: 'rgba(30, 41, 59, 0.8)' },
};

// Converts raw time strings/numbers into Unix seconds; intraday candles are shifted to TRT
function formatChartTime(time: string | number): UTCTimestamp {
  let seconds: number;
  if (typeof time === 'number') {
    seconds = time > 1e11 ? Math.floor(time / 1000) : Math.floor(time);
  } else {
    const parsed = Date.parse(time);
    seconds = Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
  }
  // Daily candles ("2026-10-21") stay on their date; only intraday ones (with a clock part) are shifted
  const isIntraday = typeof time === 'number' || time.includes(':');
  return (isIntraday ? seconds + TRT_OFFSET_SECONDS : seconds) as UTCTimestamp;
}

// Maps points to chart time, drops duplicate timestamps and sorts ascending (required by lightweight-charts)
function toSeriesData<T extends { time: string | number }>(points: T[]): (Omit<T, 'time'> & { time: UTCTimestamp })[] {
  const byTime = new Map<number, Omit<T, 'time'> & { time: UTCTimestamp }>();
  points.forEach((p) => {
    const time = formatChartTime(p.time);
    byTime.set(time, { ...p, time });
  });
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

export default function ChartWrapper({
  candles,
  indicators = [],
  rsiPane,
  height = 320,
  headerAction,
}: ChartWrapperProps) {
  const mainChartContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartContainerRef = useRef<HTMLDivElement>(null);
  const chartRefs = useRef<ChartRefs | null>(null);

  // Only explicit user choices are stored; everything else falls back to the default visibility
  const [visibilityOverrides, setVisibilityOverrides] = useState<Record<string, boolean>>({});
  const isVisible = (name: string, idx: number) => visibilityOverrides[name] ?? idx < DEFAULT_VISIBLE_OVERLAYS;
  const visibleKey = indicators.map((ind, idx) => (isVisible(ind.name, idx) ? '1' : '0')).join('');

  const toggleSingleIndicator = (name: string, idx: number) => {
    setVisibilityOverrides((prev) => ({ ...prev, [name]: !isVisible(name, idx) }));
  };

  const activeCount = indicators.filter((ind, idx) => isVisible(ind.name, idx)).length;

  const handleToggleAll = () => {
    const nextState = activeCount === 0;
    setVisibilityOverrides(Object.fromEntries(indicators.map((ind) => [ind.name, nextState])));
  };

  // Chart construction (once) and data updates (on every change) without resetting pan/zoom
  useEffect(() => {
    if (!mainChartContainerRef.current) return;
    const initialWidth = mainChartContainerRef.current.clientWidth || 600;

    if (!chartRefs.current) {
      const mainChart = createChart(mainChartContainerRef.current, {
        ...CHART_THEME,
        width: initialWidth,
        height,
        grid: { vertLines: { color: 'rgba(30, 41, 59, 0.4)' }, horzLines: { color: 'rgba(30, 41, 59, 0.4)' } },
      });
      const candleSeries = mainChart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
      });

      let rsiChart: IChartApi | null = null;
      let rsiSeries: ISeriesApi<'Line'> | null = null;
      let trendSeries: ISeriesApi<'Line'> | null = null;

      if (rsiChartContainerRef.current && rsiPane) {
        const rsi = createChart(rsiChartContainerRef.current, {
          ...CHART_THEME,
          width: rsiChartContainerRef.current.clientWidth || initialWidth,
          height: 165,
          grid: { vertLines: { color: 'rgba(30, 41, 59, 0.35)' }, horzLines: { color: 'rgba(30, 41, 59, 0.35)' } },
        });
        const rsiLine = rsi.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
        [
          { price: 70, color: 'rgba(148, 163, 184, 0.45)' },
          { price: 50, color: 'rgba(148, 163, 184, 0.30)' },
          { price: 30, color: 'rgba(148, 163, 184, 0.45)' },
        ].forEach((lvl) => {
          rsiLine.createPriceLine({ price: lvl.price, color: lvl.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
        });
        trendSeries = rsi.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });

        // Keep both panes scrolled/zoomed together
        mainChart.timeScale().subscribeVisibleLogicalRangeChange((range: LogicalRange | null) => {
          if (range) rsi.timeScale().setVisibleLogicalRange(range);
        });
        rsi.timeScale().subscribeVisibleLogicalRangeChange((range: LogicalRange | null) => {
          if (range) mainChart.timeScale().setVisibleLogicalRange(range);
        });

        rsiChart = rsi;
        rsiSeries = rsiLine;
      }

      chartRefs.current = { mainChart, candleSeries, indicatorSeries: {}, rsiChart, rsiSeries, trendSeries };
    }

    const refs = chartRefs.current;

    if (candles.length > 0) {
      refs.candleSeries.setData(toSeriesData(candles));
    }

    indicators.forEach((ind, idx) => {
      const existing = refs.indicatorSeries[ind.name];
      if (isVisible(ind.name, idx)) {
        const series = existing ?? refs.mainChart.addSeries(LineSeries, {
          color: ind.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true,
        });
        refs.indicatorSeries[ind.name] = series;
        series.setData(toSeriesData(ind.data));
      } else if (existing) {
        refs.mainChart.removeSeries(existing);
        delete refs.indicatorSeries[ind.name];
      }
    });

    if (rsiPane && refs.rsiSeries && refs.trendSeries) {
      if (rsiPane.rsi?.length > 0) refs.rsiSeries.setData(toSeriesData(rsiPane.rsi));
      if (rsiPane.trendline?.length > 1) refs.trendSeries.setData(toSeriesData(rsiPane.trendline));
    }
    // visibleKey captures every visibility change; isVisible itself is recreated each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, indicators, rsiPane, height, visibleKey]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (!chartRefs.current) return;
      chartRefs.current.mainChart.remove();
      chartRefs.current.rsiChart?.remove();
      chartRefs.current = null;
    };
  }, []);

  // Keep chart width in sync with the container
  useEffect(() => {
    const updateDimensions = () => {
      if (!chartRefs.current) return;
      if (mainChartContainerRef.current) chartRefs.current.mainChart.applyOptions({ width: mainChartContainerRef.current.clientWidth });
      if (rsiChartContainerRef.current) chartRefs.current.rsiChart?.applyOptions({ width: rsiChartContainerRef.current.clientWidth });
    };
    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(updateDimensions));
    if (mainChartContainerRef.current) resizeObserver.observe(mainChartContainerRef.current);
    if (rsiChartContainerRef.current) resizeObserver.observe(rsiChartContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="w-full space-y-2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
        <div className="flex flex-wrap items-center gap-1.5">
          {indicators.map((ind, idx) => {
            const visible = isVisible(ind.name, idx);
            return (
              <button
                key={ind.name}
                type="button"
                onClick={() => toggleSingleIndicator(ind.name, idx)}
                title={visible ? 'Grafikte Gizle' : 'Grafikte Göster'}
                className={`flex items-center space-x-1.5 rounded-md border px-2 py-1 text-[11px] font-mono transition-all cursor-pointer select-none ${
                  visible
                    ? 'bg-[#161b26] border-slate-700 text-slate-100 shadow-sm'
                    : 'bg-[#0b0e14]/40 border-slate-800/60 text-slate-500 opacity-60 hover:opacity-90'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0 transition-transform"
                  style={{
                    backgroundColor: visible ? ind.color : '#475569',
                    transform: visible ? 'scale(1)' : 'scale(0.8)',
                  }}
                />
                <span className={visible ? '' : 'line-through'}>{ind.name}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {headerAction}

          {indicators.length > 0 && (
            <button
              type="button"
              onClick={handleToggleAll}
              className="flex items-center space-x-1.5 rounded-md border border-slate-700/80 bg-[#161b26] hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors cursor-pointer shrink-0"
            >
              {activeCount > 0 ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                  <span>Çizgileri Gizle ({activeCount}/{indicators.length})</span>
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 text-blue-400" />
                  <span>Tümünü Göster</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="relative w-full">
        <div ref={mainChartContainerRef} className="w-full" />
      </div>

      {rsiPane && rsiPane.rsi && rsiPane.rsi.length > 0 && (
        <div className="relative w-full pt-2 border-t border-slate-800/80">
          <div className="absolute top-3 left-2 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
            <div className="flex items-center space-x-1.5 rounded bg-[#0b0e14]/85 border border-slate-800 px-2 py-0.5 text-[11px] font-mono text-purple-300">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <span>RSI (14)</span>
            </div>
            <div className="flex items-center space-x-1.5 rounded bg-[#0b0e14]/85 border border-blue-500/30 px-2 py-0.5 text-[11px] font-mono text-blue-400">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span>
                Düşen Trend Çizgisi {rsiPane.slope ? `(Eğim: ${rsiPane.slope})` : ''}
              </span>
            </div>
          </div>
          <div ref={rsiChartContainerRef} className="w-full" />
        </div>
      )}
    </div>
  );
}
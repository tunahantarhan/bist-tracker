'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { IndicatorOverlay, RsiPaneData } from '@/services/api';
import { Eye, EyeOff } from 'lucide-react';

interface CandleData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartWrapperProps {
  candles: CandleData[];
  indicators?: IndicatorOverlay[];
  rsiPane?: RsiPaneData;
  height?: number;
}

export default function ChartWrapper({
  candles,
  indicators = [],
  rsiPane,
  height = 320,
}: ChartWrapperProps) {
  const mainChartContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartContainerRef = useRef<HTMLDivElement>(null);

  // References to chart instances and series, to avoid re-creating them on every render
  const chartRefs = useRef<{
    mainChart: any;
    candleSeries: any;
    indicatorSeries: Record<string, any>;
    rsiChart: any;
    rsiSeries: any;
    trendSeries: any;
  } | null>(null);

  const [visibleNames, setVisibleNames] = useState<Record<string, boolean>>({});
  const [showAllOverlays, setShowAllOverlays] = useState<boolean>(false);

  // Set the indicator views on the start
  useEffect(() => {
    if (!indicators || indicators.length === 0) return;
    setVisibleNames((prev) => {
      const next = { ...prev };
      let changed = false;
      indicators.forEach((ind, idx) => {
        if (next[ind.name] === undefined) {
          next[ind.name] = idx < 2;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [indicators]);

  const toggleSingleIndicator = (name: string) => {
    setVisibleNames((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleToggleAll = () => {
    const nextState = !showAllOverlays;
    setShowAllOverlays(nextState);
    const updated: Record<string, boolean> = {};
    indicators.forEach((ind) => {
      updated[ind.name] = nextState;
    });
    setVisibleNames(updated);
  };

  // Graphical construction and data updates are handled in a single useEffect to avoid unnecessary re-renders and to maintain chart state (like zoom level) across data updates.
  useEffect(() => {
    if (!mainChartContainerRef.current) return;

    const initialWidth = mainChartContainerRef.current.clientWidth || 600;

    // 1st stage: If the chart does not exist, create it only once (initialize)
    if (!chartRefs.current) {
      const mainChart = createChart(mainChartContainerRef.current, {
        width: initialWidth,
        height,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8' },
        grid: { vertLines: { color: 'rgba(30, 41, 59, 0.4)' }, horzLines: { color: 'rgba(30, 41, 59, 0.4)' } },
        crosshair: { vertLine: { color: '#64748b', width: 1, style: 3 }, horzLine: { color: '#64748b', width: 1, style: 3 } },
        timeScale: { borderColor: 'rgba(30, 41, 59, 0.8)', timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: 'rgba(30, 41, 59, 0.8)' },
      });

      const candleSeries = mainChart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
      });

      let rsiChart: any = null;
      let rsiSeries: any = null;
      let trendSeries: any = null;

      if (rsiChartContainerRef.current && rsiPane) {
        rsiChart = createChart(rsiChartContainerRef.current, {
          width: rsiChartContainerRef.current.clientWidth || initialWidth,
          height: 165,
          layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8' },
          grid: { vertLines: { color: 'rgba(30, 41, 59, 0.35)' }, horzLines: { color: 'rgba(30, 41, 59, 0.35)' } },
          crosshair: { vertLine: { color: '#64748b', width: 1, style: 3 }, horzLine: { color: '#64748b', width: 1, style: 3 } },
          timeScale: { borderColor: 'rgba(30, 41, 59, 0.8)', timeVisible: true, secondsVisible: false },
          rightPriceScale: { borderColor: 'rgba(30, 41, 59, 0.8)' },
        });

        rsiSeries = rsiChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
        
        [ { price: 70, color: 'rgba(148, 163, 184, 0.45)' }, { price: 50, color: 'rgba(148, 163, 184, 0.30)' }, { price: 30, color: 'rgba(148, 163, 184, 0.45)' } ].forEach((lvl) => {
          rsiSeries.createPriceLine({ price: lvl.price, color: lvl.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
        });

        trendSeries = rsiChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });

        // RSI and Main Graph Synchronization
        mainChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (range && rsiChart) rsiChart.timeScale().setVisibleLogicalRange(range);
        });
        rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (range && mainChart) mainChart.timeScale().setVisibleLogicalRange(range);
        });
      }

      chartRefs.current = { mainChart, candleSeries, indicatorSeries: {}, rsiChart, rsiSeries, trendSeries };
    }

    // 2nd stage: Update the existing chart with new data (do not destroy the chart to preserve zoom and pan state)
    const refs = chartRefs.current;

    if (candles && candles.length > 0) {
      const mappedCandles = candles.map((c) => ({
        time: Math.floor(new Date(c.time).getTime() / 1000) as any,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      const uniqueCandles = Array.from(new Map(mappedCandles.map((item) => [item.time, item])).values()).sort((a, b) => a.time - b.time);
      
      // Inject only the data, do not reset zoom
      refs.candleSeries.setData(uniqueCandles);
    }

    if (indicators) {
      indicators.forEach((ind) => {
        if (visibleNames[ind.name]) {
          if (!refs.indicatorSeries[ind.name]) {
            refs.indicatorSeries[ind.name] = refs.mainChart.addSeries(LineSeries, {
              color: ind.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true,
            });
          }
          const mappedLine = ind.data.map((d) => ({ time: Math.floor(new Date(d.time).getTime() / 1000) as any, value: d.value }));
          const uniqueLine = Array.from(new Map(mappedLine.map((item) => [item.time, item])).values()).sort((a, b) => a.time - b.time);
          refs.indicatorSeries[ind.name].setData(uniqueLine);
        } else if (refs.indicatorSeries[ind.name]) {
          refs.mainChart.removeSeries(refs.indicatorSeries[ind.name]);
          delete refs.indicatorSeries[ind.name];
        }
      });
    }

    if (rsiPane && refs.rsiChart) {
      if (rsiPane.rsi && rsiPane.rsi.length > 0) {
        const mappedRsi = rsiPane.rsi.map((d) => ({ time: Math.floor(new Date(d.time).getTime() / 1000) as any, value: d.value }));
        const uniqueRsi = Array.from(new Map(mappedRsi.map((item) => [item.time, item])).values()).sort((a, b) => a.time - b.time);
        refs.rsiSeries.setData(uniqueRsi);
      }
      if (rsiPane.trendline && rsiPane.trendline.length > 1) {
        const mappedTrend = rsiPane.trendline.map((d) => ({ time: Math.floor(new Date(d.time).getTime() / 1000) as any, value: d.value }));
        const uniqueTrend = Array.from(new Map(mappedTrend.map((item) => [item.time, item])).values()).sort((a, b) => a.time - b.time);
        refs.trendSeries.setData(uniqueTrend);
      }
    }

    // NOTE: We do not return and call `remove()` here! The chart continues to live.
  }, [candles, indicators, rsiPane, height, visibleNames]); 

  // 3rd stage: When the component is completely unmounted, clean up
  useEffect(() => {
    return () => {
      if (chartRefs.current) {
        try { chartRefs.current.mainChart.remove(); } catch(e) {}
        try { if (chartRefs.current.rsiChart) chartRefs.current.rsiChart.remove(); } catch(e) {}
        chartRefs.current = null;
      }
    };
  }, []);

  // 4th stage: Handle window resize to adjust chart width dynamically
  useEffect(() => {
    const updateDimensions = () => {
      if (chartRefs.current) {
        if (mainChartContainerRef.current) chartRefs.current.mainChart.applyOptions({ width: mainChartContainerRef.current.clientWidth });
        if (rsiChartContainerRef.current && chartRefs.current.rsiChart) chartRefs.current.rsiChart.applyOptions({ width: rsiChartContainerRef.current.clientWidth });
      }
    };
    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(updateDimensions));
    if (mainChartContainerRef.current) resizeObserver.observe(mainChartContainerRef.current);
    if (rsiChartContainerRef.current) resizeObserver.observe(rsiChartContainerRef.current);
    
    return () => resizeObserver.disconnect();
  }, []);

  const activeCount = indicators.filter((i) => visibleNames[i.name]).length;

  return (
    <div className="w-full space-y-2 overflow-hidden">
      {indicators && indicators.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
          <div className="flex flex-wrap items-center gap-1.5">
            {indicators.map((ind) => {
              const isVisible = !!visibleNames[ind.name];
              return (
                <button
                  key={ind.name}
                  type="button"
                  onClick={() => toggleSingleIndicator(ind.name)}
                  title={isVisible ? 'Grafikte Gizle' : 'Grafikte Göster'}
                  className={`flex items-center space-x-1.5 rounded-md border px-2 py-1 text-[11px] font-mono transition-all cursor-pointer select-none ${
                    isVisible
                      ? 'bg-[#161b26] border-slate-700 text-slate-100 shadow-sm'
                      : 'bg-[#0b0e14]/40 border-slate-800/60 text-slate-500 opacity-60 hover:opacity-90'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0 transition-transform"
                    style={{
                      backgroundColor: isVisible ? ind.color : '#475569',
                      transform: isVisible ? 'scale(1)' : 'scale(0.8)',
                    }}
                  />
                  <span className={isVisible ? '' : 'line-through'}>{ind.name}</span>
                </button>
              );
            })}
          </div>

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
        </div>
      )}

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
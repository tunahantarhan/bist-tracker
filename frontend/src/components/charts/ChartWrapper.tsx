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
  const mainChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);

  const [visibleNames, setVisibleNames] = useState<Record<string, boolean>>({});
  const [showAllOverlays, setShowAllOverlays] = useState<boolean>(false);

  useEffect(() => {
    if (!indicators || indicators.length === 0) return;
    setVisibleNames((prev) => {
      const next = { ...prev };
      indicators.forEach((ind, idx) => {
        if (next[ind.name] === undefined) {
          next[ind.name] = idx < 2;
        }
      });
      return next;
    });
  }, [indicators]);

  const toggleSingleIndicator = (name: string) => {
    setVisibleNames((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
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

  useEffect(() => {
    if (!mainChartRef.current) return;

    const initialWidth = mainChartRef.current.clientWidth || 600;

    // 1. MAIN PRICE & OVERLAY CHART
    const mainChart = createChart(mainChartRef.current, {
      width: initialWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      crosshair: {
        vertLine: { color: '#64748b', width: 1, style: 3 },
        horzLine: { color: '#64748b', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: 'rgba(30, 41, 59, 0.8)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(30, 41, 59, 0.8)',
      },
    });

    const candleSeries =
      typeof (mainChart as any).addCandlestickSeries === 'function'
        ? (mainChart as any).addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
          })
        : mainChart.addSeries(CandlestickSeries, {
            upColor: '#10b981',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
          });

    if (candles && candles.length > 0) {
      const mappedCandles = candles.map((c) => ({
        time: Math.floor(new Date(c.time).getTime() / 1000) as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const uniqueCandles = Array.from(
        new Map(mappedCandles.map((item) => [item.time, item])).values()
      ).sort((a, b) => a.time - b.time);

      candleSeries.setData(uniqueCandles);
    }

    if (indicators && indicators.length > 0) {
      indicators.forEach((ind) => {
        if (!visibleNames[ind.name]) return;

        const lineSeries =
          typeof (mainChart as any).addLineSeries === 'function'
            ? (mainChart as any).addLineSeries({
                color: ind.color,
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: true,
              })
            : mainChart.addSeries(LineSeries, {
                color: ind.color,
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: true,
              });

        const mappedLine = ind.data.map((d) => ({
          time: Math.floor(new Date(d.time).getTime() / 1000) as any,
          value: d.value,
        }));

        const uniqueLine = Array.from(
          new Map(mappedLine.map((item) => [item.time, item])).values()
        ).sort((a, b) => a.time - b.time);

        lineSeries.setData(uniqueLine);
      });
    }

    mainChart.timeScale().fitContent();

    // 2. SYNCHRONIZED RSI(14) + BLUE DOWNTREND BREAKOUT SUB-PANE
    let rsiChart: ReturnType<typeof createChart> | null = null;

    if (rsiChartRef.current && rsiPane && rsiPane.rsi && rsiPane.rsi.length > 0) {
      rsiChart = createChart(rsiChartRef.current, {
        width: rsiChartRef.current.clientWidth || initialWidth,
        height: 165,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: 'rgba(30, 41, 59, 0.35)' },
          horzLines: { color: 'rgba(30, 41, 59, 0.35)' },
        },
        crosshair: {
          vertLine: { color: '#64748b', width: 1, style: 3 },
          horzLine: { color: '#64748b', width: 1, style: 3 },
        },
        timeScale: {
          borderColor: 'rgba(30, 41, 59, 0.8)',
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: 'rgba(30, 41, 59, 0.8)',
        },
      });

      const rsiLineSeries =
        typeof (rsiChart as any).addLineSeries === 'function'
          ? (rsiChart as any).addLineSeries({
              color: '#a855f7',
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
            })
          : rsiChart.addSeries(LineSeries, {
              color: '#a855f7',
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
            });

      const mappedRsi = rsiPane.rsi.map((d) => ({
        time: Math.floor(new Date(d.time).getTime() / 1000) as any,
        value: d.value,
      }));
      const uniqueRsi = Array.from(
        new Map(mappedRsi.map((item) => [item.time, item])).values()
      ).sort((a, b) => a.time - b.time);

      rsiLineSeries.setData(uniqueRsi);

      [
        { price: 70, color: 'rgba(148, 163, 184, 0.45)', title: '70' },
        { price: 50, color: 'rgba(148, 163, 184, 0.30)', title: '50' },
        { price: 30, color: 'rgba(148, 163, 184, 0.45)', title: '30' },
      ].forEach((lvl) => {
        rsiLineSeries.createPriceLine({
          price: lvl.price,
          color: lvl.color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: lvl.title,
        });
      });

      if (rsiPane.trendline && rsiPane.trendline.length > 1) {
        const trendSeries =
          typeof (rsiChart as any).addLineSeries === 'function'
            ? (rsiChart as any).addLineSeries({
                color: '#3b82f6',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: true,
              })
            : rsiChart.addSeries(LineSeries, {
                color: '#3b82f6',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: true,
              });

        const mappedTrend = rsiPane.trendline.map((d) => ({
          time: Math.floor(new Date(d.time).getTime() / 1000) as any,
          value: d.value,
        }));
        const uniqueTrend = Array.from(
          new Map(mappedTrend.map((item) => [item.time, item])).values()
        ).sort((a, b) => a.time - b.time);

        trendSeries.setData(uniqueTrend);
      }

      rsiChart.timeScale().fitContent();

      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && rsiChart) {
          rsiChart.timeScale().setVisibleLogicalRange(range);
        }
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          mainChart.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    // Use ResizeObserver on the container itself so that when the container's size changes due to 
    // flex/grid layout shifts, the chart resizes immediately
    const updateChartDimensions = () => {
      if (mainChartRef.current && mainChartRef.current.clientWidth > 0) {
        mainChart.applyOptions({ width: mainChartRef.current.clientWidth });
      }
      if (rsiChartRef.current && rsiChart && rsiChartRef.current.clientWidth > 0) {
        rsiChart.applyOptions({ width: rsiChartRef.current.clientWidth });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      // To wait for flexbox render time, we use a small delay before updating chart dimensions
      requestAnimationFrame(updateChartDimensions);
    });

    if (mainChartRef.current) resizeObserver.observe(mainChartRef.current);
    if (rsiChartRef.current) resizeObserver.observe(rsiChartRef.current);

    // At the first mount, force the chart to fit the container's width
    setTimeout(updateChartDimensions, 50);

    return () => {
      resizeObserver.disconnect();
      mainChart.remove();
      if (rsiChart) rsiChart.remove();
    };
  }, [candles, indicators, rsiPane, height, visibleNames]);

  const activeCount = indicators.filter((i) => visibleNames[i.name]).length;

  return (
    <div className="w-full space-y-2 overflow-hidden">
      {/* Interactive Indicator Toggle Bar */}
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

      {/* Main Price Chart */}
      <div className="relative w-full">
        <div ref={mainChartRef} className="w-full" />
      </div>

      {/* RSI(14) + Blue Downtrend Breakout Sub-Pane */}
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
          <div ref={rsiChartRef} className="w-full" />
        </div>
      )}
    </div>
  );
}
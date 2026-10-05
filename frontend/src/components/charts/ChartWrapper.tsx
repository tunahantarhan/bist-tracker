'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { IndicatorOverlay, RsiPaneData } from '@/services/api';

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

  useEffect(() => {
    if (!mainChartRef.current) return;

    // 1. MAIN PRICE & OVERLAY CHART
    const mainChart = createChart(mainChartRef.current, {
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
      height,
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
        const lineSeries =
          typeof (mainChart as any).addLineSeries === 'function'
            ? (mainChart as any).addLineSeries({
                color: ind.color,
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: true,
              })
            : mainChart.addSeries(LineSeries, {
                color: ind.color,
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: true,
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
        height: 165,
      });

      // Purple RSI(14) curve (like TradingView default)
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

      // Horizontal 3-Zone Reference Lines: 70 (Upper), 50 (Middle), 30 (Lower)
      [
        { price: 70, color: 'rgba(148, 163, 184, 0.45)', title: '70' },
        { price: 50, color: 'rgba(148, 163, 184, 0.30)', title: '50' },
        { price: 30, color: 'rgba(148, 163, 184, 0.45)', title: '30' },
      ].forEach((lvl) => {
        rsiLineSeries.createPriceLine({
          price: lvl.price,
          color: lvl.color,
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: lvl.title,
        });
      });

      // Blue Descending Trendline (Mavi Çizgi)
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

      // Synchronize horizontal zoom/pan between Main Chart and RSI Chart
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

    const handleResize = () => {
      if (mainChartRef.current) {
        mainChart.applyOptions({ width: mainChartRef.current.clientWidth });
      }
      if (rsiChartRef.current && rsiChart) {
        rsiChart.applyOptions({ width: rsiChartRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      if (rsiChart) rsiChart.remove();
    };
  }, [candles, indicators, rsiPane, height]);

  return (
    <div className="w-full space-y-2">
      {/* Main Price Chart */}
      <div className="relative w-full">
        {indicators && indicators.length > 0 && (
          <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2 pointer-events-none">
            {indicators.map((ind) => (
              <div
                key={ind.name}
                className="flex items-center space-x-1.5 rounded bg-[#0b0e14]/85 border border-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-200 backdrop-blur-sm"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: ind.color }}
                />
                <span>{ind.name}</span>
              </div>
            ))}
          </div>
        )}
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
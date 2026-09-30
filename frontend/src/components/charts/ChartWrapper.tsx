'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { IndicatorOverlay } from '@/services/api';

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
  height?: number;
}

export default function ChartWrapper({ candles, indicators = [], height = 380 }: ChartWrapperProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
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

    // 1. Add Candlestick Series
    const candleSeries = typeof (chart as any).addCandlestickSeries === 'function'
      ? (chart as any).addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        })
      : chart.addSeries(CandlestickSeries, {
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

      // Deduplicate and sort timestamps in ascending order
      const uniqueCandles = Array.from(
        new Map(mappedCandles.map((item) => [item.time, item])).values()
      ).sort((a, b) => a.time - b.time);

      candleSeries.setData(uniqueCandles);
    }

    // 2. Add Indicator Overlay Lines (MA, Bollinger Bands, etc.)
    if (indicators && indicators.length > 0) {
      indicators.forEach((ind) => {
        const lineSeries = typeof (chart as any).addLineSeries === 'function'
          ? (chart as any).addLineSeries({
              color: ind.color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
            })
          : chart.addSeries(LineSeries, {
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

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, indicators, height]);

  return (
    <div className="relative w-full">
      {/* Indicator Color Legend */}
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
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
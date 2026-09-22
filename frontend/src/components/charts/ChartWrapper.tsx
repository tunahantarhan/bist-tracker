'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';

export default function ChartWrapper() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748b',
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
    });

    // Güncel API: addSeries(LineSeries, options)
    const lineSeries = chart.addSeries(LineSeries, { 
      color: '#2563eb',
      lineWidth: 2 
    });
    
    lineSeries.setData([
      { time: '2025-01-01', value: 120 },
      { time: '2025-01-02', value: 125 },
      { time: '2025-01-03', value: 122 },
      { time: '2025-01-04', value: 130 },
      { time: '2025-01-05', value: 128 },
    ]);

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
  }, []);

  return <div ref={chartContainerRef} className="w-full h-[350px]" />;
}
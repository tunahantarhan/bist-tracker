'use client';

import React from 'react';

interface ScoreGaugeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showDecimals?: boolean;
  className?: string;
}

// Colors and glow effects for different score tiers
export const getScoreTier = (score: number) => {
  if (score <= 0) {
    return {
      color: '#64748b',       // Slate 500
      glow: 'transparent',
      label: 'NÖTR',
    };
  }
  if (score <= 25) {
    return {
      color: '#ef4444',       // Rose / Red 500
      glow: 'rgba(239, 68, 68, 0.25)',
      label: 'ZAYIF',
    };
  }
  if (score <= 50) {
    return {
      color: '#f97316',       // Orange 500
      glow: 'rgba(249, 115, 22, 0.25)',
      label: 'ORTA',
    };
  }
  if (score <= 75) {
    return {
      color: '#06b6d4',       // Cyan 500
      glow: 'rgba(6, 182, 212, 0.25)',
      label: 'GÜÇLÜ',
    };
  }
  return {
    color: '#10b981',         // Emerald 400
    glow: 'rgba(16, 185, 129, 0.35)',
    label: 'MÜKEMMEL',
  };
};

export default function ScoreGauge({
  score,
  size = 'md',
  showDecimals,
  className = '',
}: ScoreGaugeProps) {
  const numScore = typeof score === 'number' && !isNaN(score) ? Math.max(0, Math.min(100, score)) : 0;
  const tier = getScoreTier(numScore);

  // Size Settings
  const config = {
    sm: {
      dimension: 38,
      strokeWidth: 3.5,
      fontSize: 'text-[11px]',
      decimals: false,
    },
    md: {
      dimension: 68,
      strokeWidth: 5.5,
      fontSize: 'text-lg',
      decimals: showDecimals ?? true,
    },
    lg: {
      dimension: 100,
      strokeWidth: 8,
      fontSize: 'text-2xl',
      decimals: showDecimals ?? true,
    },
  }[size];

  const radius = (config.dimension - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const progressLength = (numScore / 100) * arcLength;

  const displayDecimals = showDecimals !== undefined ? showDecimals : config.decimals;
  const formattedScore = score === undefined || score === null
    ? '--'
    : displayDecimals
    ? numScore.toFixed(2)
    : Math.round(numScore).toString();

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none shrink-0 ${className}`}
      style={{ width: config.dimension, height: config.dimension }}
      title={`Algoritmik Skor: ${numScore.toFixed(2)} / 100 (${tier.label})`}
    >
      <svg
        width={config.dimension}
        height={config.dimension}
        viewBox={`0 0 ${config.dimension} ${config.dimension}`}
        className="transform -rotate-[225deg]"
      >
        {/* Grey Trace (Track) */}
        <circle
          cx={config.dimension / 2}
          cy={config.dimension / 2}
          r={radius}
          fill="none"
          stroke="#1e293b" // slate-800
          strokeWidth={config.strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />

        {/* Colorful Progress Bar */}
        {numScore > 0 && (
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={radius}
            fill="none"
            stroke={tier.color}
            strokeWidth={config.strokeWidth}
            strokeDasharray={`${progressLength} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={{
              filter: `drop-shadow(0 0 4px ${tier.glow})`,
            }}
          />
        )}
      </svg>

      {/* Score */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-mono font-bold tracking-tighter ${config.fontSize} transition-colors duration-300`}
          style={{ color: tier.color }}
        >
          {formattedScore}
        </span>
      </div>
    </div>
  );
}
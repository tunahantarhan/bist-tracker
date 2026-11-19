"""Default rule suite seeded from the admin panel.

Mirrors the rule set tuned with the domain consultant: the primary filter runs on the
4h chart (parameters agreed on 2026-11-19, checked with
`python -m app.scripts.backtest_primary_filter`) and weights add up to exactly 100, so
the score is a percentage without normalisation. The second step (price above the
20-day average of 5m bars within 5 sessions) is on by default.
"""

PRIMARY_TRENDLINE_PARAMS: dict = {
    "length": 14, "lookback": 60, "min_peak": 67.0, "max_trend_end": 30.0,
    "min_bounce": 2.0, "near_gap": 5.0, "confirm_ma_days": 20, "confirm_window_sessions": 5,
}

DEFAULT_RULE_SUITE: list[dict] = [
    {
        "name": "4S RSI (14) Düşen Trend Kırılımı",
        "description": "4 saatlik grafikte RSI(14), son 60 mumdaki düşen direnç çizgisini (tepe ≥ 67 ve sonraki "
                       "tepki tepesi) dip bölgede (çizgi ≤ 30) yükselerek kesmeli (2 mum onaylı, en fazla 4 mum önce) "
                       "ya da kesmeye 5 puan kalmış ve yükseliyor olmalı; ardından 5 seans içinde fiyat, 5 dakikalık "
                       "mumlarla 20 günlük ortalamanın üstüne çıkmalı",
        "timeframe": "4h",
        "is_primary_filter": True,
        "indicator_1": "RSI",
        "indicator_1_params": {"length": 14},
        "condition": ">",
        "target_type": "indicator",
        "indicator_2": "RSI_TRENDLINE",
        "indicator_2_params": PRIMARY_TRENDLINE_PARAMS,
        "score_impact": 25.0,
        "is_active": True,
    },
    {
        "name": "Orta Vade: MA(21) > MA(50) Trendi",
        "description": "4 saatlik grafikte MA(21), MA(50) ortalamasının üzerinde",
        "timeframe": "4h",
        "is_primary_filter": False,
        "indicator_1": "SMA",
        "indicator_1_params": {"length": 21},
        "condition": ">",
        "target_type": "indicator",
        "indicator_2": "SMA",
        "indicator_2_params": {"length": 50},
        "score_impact": 12.5,
        "is_active": True,
    },
    {
        "name": "Uzun Vade: MA(100) > MA(200) Ana Trend",
        "description": "Günlük grafikte MA(100), MA(200) ana trend ortalamasının üzerinde",
        "timeframe": "1d",
        "is_primary_filter": False,
        "indicator_1": "SMA",
        "indicator_1_params": {"length": 100},
        "condition": ">",
        "target_type": "indicator",
        "indicator_2": "SMA",
        "indicator_2_params": {"length": 200},
        "score_impact": 12.5,
        "is_active": True,
    },
    {
        "name": "MACD (12,26,9) Pozitif Momentum",
        "description": "4 saatlik grafikte MACD çizgisi sinyal çizgisinin üzerinde",
        "timeframe": "4h",
        "is_primary_filter": False,
        "indicator_1": "MACD_LINE",
        "indicator_1_params": {"fast": 12, "slow": 26, "signal": 9},
        "condition": ">",
        "target_type": "indicator",
        "indicator_2": "MACD_SIGNAL",
        "indicator_2_params": {"fast": 12, "slow": 26, "signal": 9},
        "score_impact": 10.0,
        "is_active": True,
    },
    {
        "name": "Stoch RSI (14,14,3,3) Pozitif Kesişim",
        "description": "4 saatlik grafikte Stoch RSI %K çizgisi %D çizgisinin üzerinde",
        "timeframe": "4h",
        "is_primary_filter": False,
        "indicator_1": "STOCH_RSI_K",
        "indicator_1_params": {"length": 14, "rsi_length": 14, "k": 3, "d": 3},
        "condition": ">",
        "target_type": "indicator",
        "indicator_2": "STOCH_RSI_D",
        "indicator_2_params": {"length": 14, "rsi_length": 14, "k": 3, "d": 3},
        "score_impact": 10.0,
        "is_active": True,
    },
    {
        "name": "Bollinger (22, 2) Orta Bant Üzeri",
        "description": "4 saatlik grafikte fiyat Bollinger (22, 2) orta bandının üzerinde",
        "timeframe": "4h",
        "is_primary_filter": False,
        "indicator_1": "PRICE",
        "indicator_1_params": {},
        "condition": ">",
        "target_type": "indicator",
        "indicator_2": "BOLLINGER_MIDDLE",
        "indicator_2_params": {"length": 22, "std_dev": 2.0},
        "score_impact": 10.0,
        "is_active": True,
    },
    {
        "name": "Kısa Vade: MA(9) > MA(14) Trendi",
        "description": "15 dakikalık grafikte MA(9), MA(14) ortalamasının üzerinde",
        "timeframe": "15m",
        "is_primary_filter": False,
        "indicator_1": "SMA",
        "indicator_1_params": {"length": 9},
        "condition": ">",
        "target_type": "indicator",
        "indicator_2": "SMA",
        "indicator_2_params": {"length": 14},
        "score_impact": 10.0,
        "is_active": True,
    },
    {
        "name": "5Dk MA(9) Yukarı Keser MA(21)",
        "description": "5 dakikalık grafikte MA(9), MA(21) ortalamasını aşağıdan yukarı kesiyor",
        "timeframe": "5m",
        "is_primary_filter": False,
        "indicator_1": "SMA",
        "indicator_1_params": {"length": 9},
        "condition": "crosses_above",
        "target_type": "indicator",
        "indicator_2": "SMA",
        "indicator_2_params": {"length": 21},
        "score_impact": 10.0,
        "is_active": True,
    },
]

assert sum(r["score_impact"] for r in DEFAULT_RULE_SUITE) == 100.0, "default weights must add up to 100"

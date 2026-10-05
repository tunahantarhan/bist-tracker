@router.get("/market/{symbol}")
async def get_market_data(
    symbol: str,
    period: str | None = None,
    interval: str = "4h",
    db: AsyncSession = Depends(get_db),
):
    """
    Fetches historical candles, evaluates active rules across timeframes concurrently,
    and vectorizes candle/indicator serialization for fast response times.
    """
    try:
        # Fetch active rules from DB and chart data concurrently
        chart_task = asyncio.create_task(
            provider.fetch_historical_data(symbol=symbol, period=period, interval=interval)
        )
        rules_task = asyncio.create_task(
            db.execute(select(Rule).where(Rule.is_active == True).order_by(Rule.is_primary_filter.desc(), Rule.id.asc()))
        )

        chart_df, active_rules_res = await asyncio.gather(chart_task, rules_task)

        if chart_df.empty:
            raise HTTPException(status_code=404, detail="Hisse verisi bulunamadı")

        active_rules = list(active_rules_res.scalars().all())

        df_reset = chart_df.reset_index()
        date_col = "Datetime" if "Datetime" in df_reset.columns else "Date"
        time_strings = df_reset[date_col].astype(str).tolist()

        closes = df_reset["Close"].astype(float).round(2).tolist()
        opens = df_reset["Open"].astype(float).round(2).tolist()
        highs = df_reset["High"].astype(float).round(2).tolist()
        lows = df_reset["Low"].astype(float).round(2).tolist()

        last_close = closes[-1]
        prev_close = closes[-2] if len(closes) > 1 else last_close
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2)

        # Fast list comprehension instead of slow Pandas .iterrows()
        candles = [
            {"time": t, "open": o, "high": h, "low": l, "close": c}
            for t, o, h, l, c in zip(time_strings, opens, highs, lows, closes)
        ]

        required_tfs = {getattr(r, "timeframe", "1d") or "1d" for r in active_rules}
        dataframes_by_tf = {interval: chart_df}
        missing_tfs = [tf for tf in required_tfs if tf not in dataframes_by_tf]

        if missing_tfs:
            fetched_dfs = await asyncio.gather(
                *[provider.fetch_historical_data(symbol=symbol, interval=tf) for tf in missing_tfs],
                return_exceptions=True,
            )
            for tf, res_df in zip(missing_tfs, fetched_dfs):
                if isinstance(res_df, pd.DataFrame) and not res_df.empty:
                    dataframes_by_tf[tf] = res_df

        evaluation = {
            "total_score": 0.0,
            "primary_filter_passed": True,
            "has_primary_filter": False,
            "rules_breakdown": [],
        }
        indicator_overlays = []

        if active_rules:
            evaluation = RuleEngine.evaluate_symbol(chart_df, active_rules, dataframes_by_tf=dataframes_by_tf)

            seen_overlays = set()
            color_idx = 0

            for rule in active_rules:
                pairs = [(rule.indicator_1, rule.indicator_1_params)]
                if rule.target_type == "indicator" and rule.indicator_2:
                    pairs.append((rule.indicator_2, rule.indicator_2_params))

                for ind_name, ind_params in pairs:
                    if not ind_name or ind_name.upper() not in OVERLAY_INDICATORS:
                        continue
                    params_dict = ind_params or {}
                    length_val = params_dict.get("length", params_dict.get("period", ""))
                    key = f"{ind_name.upper()}_{length_val}"

                    if key in seen_overlays:
                        continue
                    seen_overlays.add(key)

                    try:
                        series = RuleEngine.get_indicator_series(chart_df, ind_name, params_dict)
                        if series is not None:
                            vals = series.tolist()
                            line_data = [
                                {"time": t, "value": round(float(v), 2)}
                                for t, v in zip(time_strings, vals)
                                if pd.notna(v)
                            ]
                            label = f"{ind_name.upper()} ({length_val})" if length_val else ind_name.upper()
                            indicator_overlays.append({
                                "name": label,
                                "color": LINE_COLORS[color_idx % len(LINE_COLORS)],
                                "data": line_data
                            })
                            color_idx += 1
                    except Exception as ind_err:
                        print(f"Overlay calculation skipped for {key}: {ind_err}")

        rsi_pane = {"rsi": [], "trendline": [], "slope": None, "peak_rsi": None}
        try:
            rsi_series = RuleEngine.get_indicator_series(chart_df, "RSI", {"length": 14})
            trend_series, trend_meta = RuleEngine.calculate_rsi_downtrend_series(
                df_reset["Close"].astype(float), {"length": 14, "lookback": 60}
            )
            r_vals = rsi_series.tolist()
            tr_vals = trend_series.tolist()

            rsi_pane["rsi"] = [
                {"time": t, "value": round(float(v), 2)}
                for t, v in zip(time_strings, r_vals)
                if pd.notna(v)
            ]
            rsi_pane["trendline"] = [
                {"time": t, "value": round(float(v), 2)}
                for t, v in zip(time_strings, tr_vals)
                if pd.notna(v)
            ]
            rsi_pane["slope"] = trend_meta.get("slope")
            rsi_pane["peak_rsi"] = trend_meta.get("peak_rsi")
        except Exception as rsi_err:
            print(f"RSI sub-pane calculation skipped: {rsi_err}")

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "current_price": round(last_close, 2),
            "change_pct": change_pct,
            "candles": candles,
            "score": evaluation["total_score"],
            "primary_filter_passed": evaluation["primary_filter_passed"],
            "has_primary_filter": evaluation["has_primary_filter"],
            "rules_breakdown": evaluation["rules_breakdown"],
            "indicators": indicator_overlays,
            "rsi_pane": rsi_pane,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
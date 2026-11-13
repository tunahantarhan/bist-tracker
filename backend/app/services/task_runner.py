import logging
import time

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.market_hours import is_bist_open
from app.services.alert_dispatcher import dispatch_alerts
from app.services.market_service import get_active_rules, get_overview, scan_stats

logger = logging.getLogger(__name__)

_last_scan: dict[str, float] = {"at": 0.0}


async def run_market_scan() -> None:
    """Scheduled job: refreshes the universe snapshot and dispatches alerts.

    In session: full scan every `SCAN_INTERVAL_MINUTES`, then notifications.
    Off session: the snapshot is still refreshed every `OFF_HOURS_SCAN_INTERVAL_MINUTES`
    (cheap: candles are cached until the next open, only quotes move), so visitors at
    night see final closes without waiting; no notifications are produced unless
    `NOTIFY_ONLY_WHEN_MARKET_OPEN` is disabled.
    """
    market_open = is_bist_open()
    notify = market_open or not settings.NOTIFY_ONLY_WHEN_MARKET_OPEN
    if not market_open and time.time() - _last_scan["at"] < settings.OFF_HOURS_SCAN_INTERVAL_MINUTES * 60:
        return

    try:
        overview = await get_overview(force_refresh=True)
        _last_scan["at"] = time.time()
    except Exception:
        logger.exception("Market scan failed")
        return

    sent = 0
    if notify:
        async with AsyncSessionLocal() as db:
            try:
                rules = await get_active_rules(db)
                sent = await dispatch_alerts(db, overview, rules)
            except Exception:
                logger.exception("Alert dispatch failed")

    logger.info(
        "Market scan done in %ss: %d symbols, %d passed primary filter, %d notifications",
        scan_stats()["last_scan_seconds"],
        len(overview.get("items", [])),
        len(overview.get("rsi_passed", [])),
        sent,
    )

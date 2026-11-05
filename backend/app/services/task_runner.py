import logging

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.market_hours import is_bist_open
from app.services.alert_dispatcher import dispatch_alerts
from app.services.market_service import get_active_rules, get_overview

logger = logging.getLogger(__name__)


async def run_market_scan() -> None:
    """Scheduled job: refreshes the universe scan and dispatches alerts.

    The scan keeps the overview cache warm even when nobody has the dashboard open;
    notifications are only produced while BIST is in session (configurable).
    """
    market_open = is_bist_open()
    if settings.NOTIFY_ONLY_WHEN_MARKET_OPEN and not market_open:
        logger.debug("Market closed, skipping scan")
        return

    async with AsyncSessionLocal() as db:
        try:
            overview = await get_overview(db, force_refresh=True)
            rules = await get_active_rules(db)
            sent = await dispatch_alerts(db, overview, rules)
            logger.info(
                "Market scan done: %d symbols, %d passed primary filter, %d notifications",
                len(overview.get("items", [])),
                len(overview.get("rsi_passed", [])),
                sent,
            )
        except Exception:
            logger.exception("Market scan failed")

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import settings
from app.services.task_runner import run_market_scan

scheduler = AsyncIOScheduler(timezone="Europe/Istanbul")


def start_scheduler() -> None:
    scheduler.add_job(
        run_market_scan,
        "interval",
        minutes=settings.SCAN_INTERVAL_MINUTES,
        id="market_scan_job",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)

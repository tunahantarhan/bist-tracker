"""Borsa Istanbul trading-session helpers (Europe/Istanbul, UTC+3, no DST)."""

from datetime import datetime, time, timedelta, timezone

TR_TZ = timezone(timedelta(hours=3))

# Continuous session incl. closing auction. Official holidays are not modelled yet.
SESSION_OPEN = time(10, 0)
SESSION_CLOSE = time(18, 10)


def now_tr() -> datetime:
    return datetime.now(TR_TZ)


def now_tr_naive() -> datetime:
    """Turkey local time without tzinfo, for the naive `user_custom_alerts` timestamp columns."""
    return now_tr().replace(tzinfo=None)


def is_bist_open(at: datetime | None = None) -> bool:
    at = (at or now_tr()).astimezone(TR_TZ)
    if at.weekday() >= 5:  # Saturday / Sunday
        return False
    return SESSION_OPEN <= at.time() < SESSION_CLOSE

"""Borsa Istanbul trading-session helpers (Europe/Istanbul, UTC+3, no DST)."""

from datetime import datetime, time, timedelta, timezone

TR_TZ = timezone(timedelta(hours=3))

# Session incl. closing auction. Official holidays are not modelled yet.
SESSION_OPEN = time(10, 0)
# Continuous trading ends here; 18:00-18:10 is the closing auction, which intraday
# candles do not contain (the auction price only shows up in the daily bar / quote).
CONTINUOUS_CLOSE = time(18, 0)
SESSION_CLOSE = time(18, 10)


def now_tr() -> datetime:
    return datetime.now(TR_TZ)


def now_tr_naive() -> datetime:
    """Turkey local time without tzinfo, for the naive `user_custom_alerts` timestamp columns."""
    return now_tr().replace(tzinfo=None)


def _is_trading_day(d: datetime) -> bool:
    return d.weekday() < 5  # Saturday / Sunday closed


def is_bist_open(at: datetime | None = None) -> bool:
    at = (at or now_tr()).astimezone(TR_TZ)
    return _is_trading_day(at) and SESSION_OPEN <= at.time() < SESSION_CLOSE


def last_session_close(at: datetime | None = None) -> datetime:
    """Most recent session close at or before `at` (the moment data stops changing)."""
    at = (at or now_tr()).astimezone(TR_TZ)
    day = at
    for _ in range(8):
        close = datetime.combine(day.date(), SESSION_CLOSE, TR_TZ)
        if _is_trading_day(day) and close <= at:
            return close
        day -= timedelta(days=1)
    return at  # unreachable with a 5-day week


def next_session_open(at: datetime | None = None) -> datetime:
    """Next session open strictly after `at` (or the current one if the session is running)."""
    at = (at or now_tr()).astimezone(TR_TZ)
    day = at
    for _ in range(8):
        opening = datetime.combine(day.date(), SESSION_OPEN, TR_TZ)
        if _is_trading_day(day) and opening > at:
            return opening
        day += timedelta(days=1)
    return at


def market_state(at: datetime | None = None) -> str:
    """`open`, `auction` (closing auction 18:00-18:10) or `closed`."""
    at = (at or now_tr()).astimezone(TR_TZ)
    if not is_bist_open(at):
        return "closed"
    return "auction" if at.time() >= CONTINUOUS_CLOSE else "open"

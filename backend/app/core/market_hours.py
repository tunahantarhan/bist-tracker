"""Borsa Istanbul trading-session helpers (Europe/Istanbul, UTC+3, no DST)."""

from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache

TR_TZ = timezone(timedelta(hours=3))

# Session incl. closing auction.
SESSION_OPEN = time(10, 0)
# Continuous trading ends here; 18:00-18:10 is the closing auction, which intraday
# candles do not contain (the auction price only shows up in the daily bar / quote).
CONTINUOUS_CLOSE = time(18, 0)
SESSION_CLOSE = time(18, 10)
# Half-day sessions (eves of religious holidays and of 29 October)
HALF_DAY_CONTINUOUS_CLOSE = time(12, 30)
HALF_DAY_SESSION_CLOSE = time(12, 40)

# Weekday market holidays (Borsa Istanbul holiday table; religious holidays from the
# Diyanet calendar). Bridge days the government adds later go to MARKET_EXTRA_HOLIDAYS.
HOLIDAYS = frozenset(date.fromisoformat(d) for d in (
    # 2026
    "2026-01-01", "2026-03-20", "2026-04-23", "2026-05-01", "2026-05-19",
    "2026-05-27", "2026-05-28", "2026-05-29", "2026-07-15", "2026-10-29",
    # 2027
    "2027-01-01", "2027-03-09", "2027-03-10", "2027-03-11", "2027-04-23",
    "2027-05-17", "2027-05-18", "2027-05-19", "2027-07-15", "2027-08-30", "2027-10-29",
))
HALF_DAYS = frozenset(date.fromisoformat(d) for d in (
    "2026-03-19", "2026-05-26", "2026-10-28",
    "2027-03-08", "2027-10-28",
))


def now_tr() -> datetime:
    return datetime.now(TR_TZ)


def now_tr_naive() -> datetime:
    """Turkey local time without tzinfo, for the naive `user_custom_alerts` timestamp columns."""
    return now_tr().replace(tzinfo=None)


@lru_cache(maxsize=1)
def _extra_holidays() -> frozenset[date]:
    """`MARKET_EXTRA_HOLIDAYS` from the settings: comma-separated ISO dates."""
    try:
        from app.core.config import settings
        raw = settings.MARKET_EXTRA_HOLIDAYS
    except Exception:
        return frozenset()
    return frozenset(date.fromisoformat(d.strip()) for d in raw.split(",") if d.strip())


def is_trading_day(d: date | datetime) -> bool:
    day = d.date() if isinstance(d, datetime) else d
    return day.weekday() < 5 and day not in HOLIDAYS and day not in _extra_holidays()


_is_trading_day = is_trading_day


def continuous_close_on(d: date | datetime) -> time:
    day = d.date() if isinstance(d, datetime) else d
    return HALF_DAY_CONTINUOUS_CLOSE if day in HALF_DAYS else CONTINUOUS_CLOSE


def session_close_on(d: date | datetime) -> time:
    day = d.date() if isinstance(d, datetime) else d
    return HALF_DAY_SESSION_CLOSE if day in HALF_DAYS else SESSION_CLOSE


def is_bist_open(at: datetime | None = None) -> bool:
    at = (at or now_tr()).astimezone(TR_TZ)
    return _is_trading_day(at) and SESSION_OPEN <= at.time() < session_close_on(at)


def last_session_close(at: datetime | None = None) -> datetime:
    """Most recent session close at or before `at` (the moment data stops changing)."""
    at = (at or now_tr()).astimezone(TR_TZ)
    day = at
    for _ in range(20):  # long enough for a 9-day holiday
        close = datetime.combine(day.date(), session_close_on(day), TR_TZ)
        if _is_trading_day(day) and close <= at:
            return close
        day -= timedelta(days=1)
    return at


def next_session_open(at: datetime | None = None) -> datetime:
    """Next session open strictly after `at` (or the current one if the session is running)."""
    at = (at or now_tr()).astimezone(TR_TZ)
    day = at
    for _ in range(20):
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
    return "auction" if at.time() >= continuous_close_on(at) else "open"


def session_close_after(at: datetime, sessions: int) -> datetime:
    """Close of the trading session `sessions` sessions after the one `at` falls on
    (0 = the same day's close; weekends and holidays skipped)."""
    at = at.astimezone(TR_TZ)
    day = at.date()
    while not _is_trading_day(datetime.combine(day, SESSION_OPEN, TR_TZ)):
        day += timedelta(days=1)
    left = sessions
    while left > 0:
        day += timedelta(days=1)
        if _is_trading_day(datetime.combine(day, SESSION_OPEN, TR_TZ)):
            left -= 1
    return datetime.combine(day, session_close_on(day), TR_TZ)

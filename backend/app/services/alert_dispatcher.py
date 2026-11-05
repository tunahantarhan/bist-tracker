"""Turns a market overview into user notifications.

Two sources:
  * System alerts: every active user is told when a stock passes the primary (RSI) filter.
  * Custom alerts: a user subscribed to (symbol, rule) and that rule is met for the symbol.

Duplicate suppression is handled by NotificationService cooldowns (per user/symbol/rule).
"""

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.market_hours import now_tr_naive
from app.models.alert import UserCustomAlert
from app.models.rule import Rule
from app.models.user import User
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

TIMEFRAME_LONG_LABELS = {
    "5m": "5 dakikalık",
    "15m": "15 dakikalık",
    "1h": "1 saatlik",
    "4h": "4 saatlik",
    "1d": "günlük",
}


def _tf_label(tf: str | None) -> str:
    tf = (tf or "").lower()
    return TIMEFRAME_LONG_LABELS.get(tf, f"{tf.upper()} periyotluk")


@dataclass(frozen=True)
class _RuleInfo:
    id: int
    name: str
    timeframe: str
    is_primary_filter: bool


async def dispatch_alerts(db: AsyncSession, overview: dict[str, Any], rules: list[Rule]) -> int:
    """Creates notifications for the given overview. Returns the number of notifications sent.

    ORM rows are copied into plain values up front: a rollback after a failed send would
    otherwise expire them and make later attribute access hit the database lazily.
    """
    service = NotificationService(db)
    sent = 0

    rule_infos = [_RuleInfo(r.id, r.name, r.timeframe or "1d", bool(r.is_primary_filter)) for r in rules]
    rules_by_id = {r.id: r for r in rule_infos}
    primary = next((r for r in rule_infos if r.is_primary_filter), None)

    users_res = await db.execute(select(User.id, User.email).where(User.is_active.is_(True)))
    active_users = [(uid, email) for uid, email in users_res.all()]

    alerts_res = await db.execute(
        select(UserCustomAlert.id, UserCustomAlert.user_id, UserCustomAlert.symbol,
               UserCustomAlert.rule_id, UserCustomAlert.timeframe, User.email)
        .join(User, UserCustomAlert.user_id == User.id)
        .where(UserCustomAlert.is_active.is_(True), User.is_active.is_(True))
    )
    custom_alerts = alerts_res.all()

    # 1) System alerts for stocks passing the primary filter
    if primary:
        for item in overview.get("rsi_passed", []):
            msg = (
                f"{item['symbol']} hissesi {_tf_label(primary.timeframe)} grafikte "
                f"'{primary.name}' koşulunu sağladı. Güncel fiyat: ₺{item['current_price']:.2f}"
            )
            for user_id, email in active_users:
                try:
                    if await service.trigger_notification(
                        user_id=user_id,
                        symbol=item["symbol"],
                        message=msg,
                        rule_id=primary.id,
                        user_email=email,
                        timeframe=primary.timeframe,
                    ):
                        sent += 1
                except Exception as e:
                    await db.rollback()
                    logger.warning("System alert %s -> user %s failed: %s", item["symbol"], user_id, e)

    # 2) User custom alerts
    items_by_symbol = {i["symbol"]: i for i in overview.get("items", [])}

    for alert_id, user_id, symbol, rule_id, alert_tf, email in custom_alerts:
        item = items_by_symbol.get(symbol)
        if not item:
            continue

        rule = rules_by_id.get(rule_id) if rule_id else primary
        if rule is None:
            continue  # rule was deactivated or deleted

        if rule.is_primary_filter:
            passed = bool(item.get("primary_filter_passed"))
        else:
            passed = any(rb.get("id") == rule.id and rb.get("is_met") for rb in item.get("rules_breakdown", []))
        if not passed:
            continue

        msg = (
            f"Takip ettiğiniz {symbol} hissesinde '{rule.name}' kuralı sağlandı. "
            f"Güncel fiyat: ₺{item['current_price']:.2f}"
        )
        try:
            notification = await service.trigger_notification(
                user_id=user_id,
                symbol=symbol,
                message=msg,
                rule_id=rule.id,
                user_email=email,
                timeframe=alert_tf or rule.timeframe,
            )
            if notification:
                await db.execute(
                    update(UserCustomAlert)
                    .where(UserCustomAlert.id == alert_id)
                    .values(last_triggered_at=now_tr_naive())
                )
                await db.commit()
                sent += 1
        except Exception as e:
            await db.rollback()
            logger.warning("Custom alert %s (user %s) failed: %s", symbol, user_id, e)

    return sent

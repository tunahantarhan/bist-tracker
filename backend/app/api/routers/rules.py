from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.core.database import get_db
from app.core.default_rules import DEFAULT_RULE_SUITE
from app.models.rule import Rule
from app.schemas.rule import RuleCreate, RuleResponse, RuleUpdate
from app.services.market_service import invalidate_market_caches

router = APIRouter(prefix="/rules", tags=["Rules"])


async def _get_rule_or_404(db: AsyncSession, rule_id: int) -> Rule:
    rule = await db.get(Rule, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kural bulunamadı")
    return rule


async def _ensure_single_primary(db: AsyncSession, keep_id: int | None) -> None:
    """Only one rule may act as the primary filter."""
    result = await db.execute(select(Rule).where(Rule.is_primary_filter.is_(True)))
    for other in result.scalars().all():
        if other.id != keep_id:
            other.is_primary_filter = False


@router.get("", response_model=list[RuleResponse], dependencies=[Depends(get_current_user)])
async def list_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Rule).order_by(Rule.is_primary_filter.desc(), Rule.id.desc()))
    return result.scalars().all()


@router.post("", response_model=RuleResponse, dependencies=[Depends(get_current_admin)])
async def create_rule(rule_in: RuleCreate, db: AsyncSession = Depends(get_db)):
    rule = Rule(**rule_in.model_dump())
    db.add(rule)
    await db.flush()
    if rule.is_primary_filter:
        await _ensure_single_primary(db, rule.id)
    await db.commit()
    await db.refresh(rule)
    await invalidate_market_caches()
    return rule


@router.patch("/{rule_id}", response_model=RuleResponse, dependencies=[Depends(get_current_admin)])
async def update_rule(rule_id: int, rule_in: RuleUpdate, db: AsyncSession = Depends(get_db)):
    rule = await _get_rule_or_404(db, rule_id)
    for field, value in rule_in.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    if rule.is_primary_filter:
        await _ensure_single_primary(db, rule.id)
    await db.commit()
    await db.refresh(rule)
    await invalidate_market_caches()
    return rule


@router.delete("/{rule_id}", dependencies=[Depends(get_current_admin)])
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    rule = await _get_rule_or_404(db, rule_id)
    if rule.is_primary_filter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ana RSI Filtresi sistemin çekirdeğidir ve silinemez. Yalnızca pasife alabilir veya parametrelerini düzenleyebilirsiniz.",
        )
    await db.delete(rule)
    await db.commit()
    await invalidate_market_caches()
    return {"detail": "Kural silindi"}


@router.post("/seed-defaults", response_model=list[RuleResponse], dependencies=[Depends(get_current_admin)])
async def seed_default_rules(db: AsyncSession = Depends(get_db)):
    """Adds the default suite; rules whose names already exist are skipped, and a second primary is never created."""
    existing = await db.execute(select(Rule.name, Rule.is_primary_filter))
    rows = existing.all()
    existing_names = {name for name, _ in rows}
    has_primary = any(is_primary for _, is_primary in rows)

    created: list[Rule] = []
    for item in DEFAULT_RULE_SUITE:
        if item["name"] in existing_names or (item.get("is_primary_filter") and has_primary):
            continue
        rule = Rule(**item)
        db.add(rule)
        created.append(rule)

    await db.commit()
    for rule in created:
        await db.refresh(rule)
    await invalidate_market_caches()
    return created

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.rule import Rule
from app.schemas.rule import RuleCreate, RuleResponse
from typing import List

# API endpoint'lerini barındıran router modülü
router = APIRouter(prefix="/rules", tags=["Rules"])

@router.get("", response_model=List[RuleResponse])
async def get_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Rule).order_by(Rule.id.desc()))
    return result.scalars().all()

@router.post("", response_model=RuleResponse)
async def create_rule(rule_in: RuleCreate, db: AsyncSession = Depends(get_db)):
    new_rule = Rule(**rule_in.model_dump())
    db.add(new_rule)
    await db.commit()
    await db.refresh(new_rule)
    return new_rule
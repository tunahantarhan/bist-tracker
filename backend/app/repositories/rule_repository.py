from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.rule import Rule

class RuleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_rules(self) -> Sequence[Rule]:
        """
        Sadece aktif (is_active=True) durumdaki kuralları getirir.
        """
        stmt = select(Rule).where(Rule.is_active == True)
        result = await self.db.execute(stmt)
        return result.scalars().all()
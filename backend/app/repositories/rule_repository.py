from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.rule import Rule

class RuleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_rules(self) -> Sequence[Rule]:
        """
        Fetches only the currently active (is_active=True) global rules.
        """
        stmt = select(Rule).where(Rule.is_active == True).order_by(Rule.id.asc())
        result = await self.db.execute(stmt)
        return result.scalars().all()
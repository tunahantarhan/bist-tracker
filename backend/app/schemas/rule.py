from pydantic import BaseModel
from typing import Dict, Any, Optional
from datetime import datetime

class RuleBase(BaseModel):
    symbol: str
    rule_type: str
    operator: str
    threshold: float
    # İndikatöre özel dinamik parametreler (örn: period: 14) JSONB olarak tutulur
    parameters: Dict[str, Any] = {}

class RuleCreate(RuleBase):
    pass

class RuleResponse(RuleBase):
    id: int
    is_active: bool
    last_triggered_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True
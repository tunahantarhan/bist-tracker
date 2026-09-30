from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class RuleBase(BaseModel):
    name: str
    description: Optional[str] = None
    indicator_1: str
    indicator_1_params: Optional[Dict[str, Any]] = None
    condition: str
    target_type: str
    static_value: Optional[float] = None
    indicator_2: Optional[str] = None
    indicator_2_params: Optional[Dict[str, Any]] = None
    score_impact: float
    is_active: bool = True

class RuleCreate(RuleBase):
    pass

class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    indicator_1: Optional[str] = None
    indicator_1_params: Optional[Dict[str, Any]] = None
    condition: Optional[str] = None
    target_type: Optional[str] = None
    static_value: Optional[float] = None
    indicator_2: Optional[str] = None
    indicator_2_params: Optional[Dict[str, Any]] = None
    score_impact: Optional[float] = None
    is_active: Optional[bool] = None

class RuleResponse(RuleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# In the case of Rule is imported in another file, we can use an alias to avoid naming conflicts.
Rule = RuleResponse
from pydantic import BaseModel, Field
from typing import List, Optional

class SymptomRequest(BaseModel):
    user_input: str = Field(..., json_schema_extra={"example":"I have a sharp pain in my lower back and a fever."})
    age:int
    existing_conditions: Optional[List[str]] = Field(default_factory=list)

class TriageResponse(BaseModel):
    urgency_level:str
    potential_diagnosis: List[str]
    suggested_action: List[str]
    disclaimer: str

from pydantic import BaseModel, Field
from typing import List, Optional


class ChatRequest(BaseModel):
    message: str = Field(..., json_schema_extra={"example": "Hey Zen, what can you do?"})
    history: Optional[List[dict]] = None


class ChatResponse(BaseModel):
    reply: str
    suggested_prompts: Optional[List[str]] = None

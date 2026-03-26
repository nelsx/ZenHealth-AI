from fastapi import APIRouter, HTTPException
from app.models.chat import ChatRequest, ChatResponse
from app.services.ai_engine import chat_with_user


router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        result = await chat_with_user(request.message, request.history)
        content = getattr(result, "content", None)
        if content is None:
            content = str(result)
        return ChatResponse(
            reply=content,
            suggested_prompts=[
                "Tell me what Zen can do",
                "I want to check a symptom",
                "Show me how emergency contacts work",
                "Help me log a journal entry"
            ]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

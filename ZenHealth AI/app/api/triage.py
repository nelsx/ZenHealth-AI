from fastapi import APIRouter, HTTPException
from app.models.triage import SymptomRequest, TriageResponse
from app.services.ai_engine import analyze_symptoms

router=APIRouter()

@router.post("/analyze",response_model=TriageResponse)

async def get_triage_report(request:SymptomRequest):
    #Passing the request data to the AI
    try:
        result=await analyze_symptoms(request.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500,detail=str(e))


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.triage import router as triage_router
from app.api.chat import router as chat_router

app=FastAPI(title="ZenHealth AI")

app.add_middleware(
    CORSMiddleware,allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(triage_router, prefix="/api/triage", tags=["Medical"])
app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])

@app.get("/")
def health_check():
    return {"Message":"Server is up and running!"}

if __name__=="__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
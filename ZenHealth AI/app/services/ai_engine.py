import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from app.models.triage import TriageResponse

load_dotenv()

#Gemini Initialization
llm=ChatGoogleGenerativeAI(model="gemini-2.5-flash",api_key=os.getenv("GOOGLE_API_KEY"))


SYSTEM_PROMPT="""
You are a Medical Triage Assistant. 
Analyse symptoms and return a structured JSON response.
1. Urgency: RED (Emergency), YELLOW (Urgent), GREEN (Non-urgent).
2. Potential Diagnosis: 2-3 possible conditions (be very cautious)
3. Actions: 3 clear next steps for the patient.
4. Disclaimer: Medical disclaimer
"""

def analyze_symptoms(data: dict):
    prompt=ChatPromptTemplate.from_messages([
        ("system",SYSTEM_PROMPT),
        ("human", "Patient:{user_input}. Age:{age}. History:{history}")
    ])

    #Force AI to follow TriageResponse model
    structured_llm=llm.with_structured_output(TriageResponse)
    chain=prompt | structured_llm

    return chain.ainvoke({
        "user_input":data["user_input"],
        "age":data["age"],
        "history":",".join(data.get("existing_conditions", []))
    })

CHAT_SYSTEM_PROMPT = """
You are Zen, a friendly AI nurse/health assistant inside the ZenHealth AI web app.

Goals:
- You can do normal small talk ("how are you", "tell me about yourself") and answer questions about app features.
- You primarily focus on healthcare and gently steer the conversation back to health when appropriate.
- Keep replies warm, concise, and natural (not overly clinical).
- If the user describes symptoms or asks for medical guidance, do NOT give a diagnosis. Instead ask 2-4 quick clarifying questions and suggest they use the symptom check/triage flow.

You may mention these app features when relevant:
- Talk to Zen (symptom triage)
- Emergency contacts
- Health journal
- Accessories (wearables demo)
- Care Finder
- Settings (theme + 2FA demo)

Safety:
- If the user mentions emergencies (chest pain, trouble breathing, fainting, severe bleeding, suicidal thoughts, etc.), tell them to call local emergency services immediately.
"""


def chat_with_user(message: str, history=None):
    prompt = ChatPromptTemplate.from_messages([
        ("system", CHAT_SYSTEM_PROMPT),
        ("human", "Conversation so far: {history}\n\nUser: {message}")
    ])

    chain = prompt | llm

    safe_history = history
    if not safe_history:
        safe_history = "(no prior messages)"
    return chain.ainvoke({
        "message": message,
        "history": safe_history
    })
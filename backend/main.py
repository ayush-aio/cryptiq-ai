import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage

# Load environment variables before importing app.py because app.py
# validates the required API keys during import.
load_dotenv()

from app import react_graph_memory  # noqa: E402


app = FastAPI(
    title="CryptIQ API",
    description="FastAPI bridge for the LangGraph Crypto Analysis Agent.",
    version="1.0.0",
)

origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=6000)
    thread_id: str = Field(min_length=1, max_length=120)


def final_answer(messages: list[Any]) -> str:
    """Return the last assistant message that is not a tool-call request."""
    for message in reversed(messages):
        if getattr(message, "type", None) != "ai":
            continue
        if getattr(message, "tool_calls", None):
            continue

        content = getattr(message, "content", "")
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
            return "\n".join(part for part in parts if part)

    return "I couldn't generate a response. Please try again."


@app.get("/")
def root():
    return {
        "name": "CryptIQ API",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/chat")
def chat(request: ChatRequest):
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    config = {"configurable": {"thread_id": request.thread_id}}

    try:
        result = react_graph_memory.invoke(
            {"messages": [HumanMessage(content=message)]},
            config=config,
        )
        answer = final_answer(result.get("messages", []))
        return {"response": answer, "thread_id": request.thread_id}
    except Exception:
        # Keep secrets and provider internals out of the public API response.
        raise HTTPException(
            status_code=500,
            detail="The agent could not complete this request. Check the backend logs and API configuration.",
        )

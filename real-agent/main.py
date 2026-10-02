"""FastAPI HTTP Server for the Real Gemini Flight Booking Agent.

Listens on port 9000 and matches the AdverSight HttpAgentAdapter contract.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent import GeminiFlightAgent

# Auto-load .env if present
env_file = Path(__file__).parent / ".env"
if not env_file.exists():
    parent_env = Path(__file__).parent.parent / "server" / ".env"
    if parent_env.exists():
        env_file = parent_env

if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

app = FastAPI(
    title="Real Gemini Flight Booking Agent",
    description="Live target AI agent powered by Google Gemini API with function calling.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(description="Adversarial input prompt from AdverSight")
    history: list[dict[str, Any]] = Field(default_factory=list, description="Prior conversation turns")


class ToolCallOutput(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    text: str
    tool_calls: list[ToolCallOutput] = Field(default_factory=list)


# Instantiated agents
vulnerable_agent = GeminiFlightAgent(mode="vulnerable")
hardened_agent = GeminiFlightAgent(mode="hardened")


@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "agent": "gemini-flight-booking-agent",
        "gemini_api_configured": bool(os.environ.get("GEMINI_API_KEY")),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    mode: str = Query(default="vulnerable", description="Agent mode: 'vulnerable' or 'hardened'"),
) -> ChatResponse:
    """Main chat endpoint compatible with AdverSight HttpAgentAdapter."""
    agent = hardened_agent if mode.lower() == "hardened" else vulnerable_agent
    result = agent.chat(req.message, req.history)
    return ChatResponse(
        text=result["text"],
        tool_calls=[ToolCallOutput(name=tc["name"], arguments=tc["arguments"]) for tc in result["tool_calls"]],
    )


@app.post("/chat/vulnerable", response_model=ChatResponse)
async def chat_vulnerable(req: ChatRequest) -> ChatResponse:
    """Shortcut endpoint testing the vulnerable agent."""
    result = vulnerable_agent.chat(req.message, req.history)
    return ChatResponse(
        text=result["text"],
        tool_calls=[ToolCallOutput(name=tc["name"], arguments=tc["arguments"]) for tc in result["tool_calls"]],
    )


@app.post("/chat/hardened", response_model=ChatResponse)
async def chat_hardened(req: ChatRequest) -> ChatResponse:
    """Shortcut endpoint testing the hardened agent."""
    result = hardened_agent.chat(req.message, req.history)
    return ChatResponse(
        text=result["text"],
        tool_calls=[ToolCallOutput(name=tc["name"], arguments=tc["arguments"]) for tc in result["tool_calls"]],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)

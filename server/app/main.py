import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agents import router as agents_router
from app.api.failures import router as failures_router
from app.api.session import router as session_router
from app.api.test import router as test_router

# Default dev origins for Vite/Next/local clients, extensible via CORS_ORIGINS env var
DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

_env_cors = os.environ.get("CORS_ORIGINS", "").strip()
if _env_cors:
    extra_origins = [orig.strip() for orig in _env_cors.split(",") if orig.strip()]
    ALLOWED_ORIGINS = list(dict.fromkeys(DEFAULT_ORIGINS + extra_origins))
else:
    ALLOWED_ORIGINS = DEFAULT_ORIGINS

app = FastAPI(
    title="AdverSight API",
    description="Autonomous Adversarial Testing API for AI Agents",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all API endpoints under both /api/v1 and /api for full frontend & client compatibility
for prefix in ("/api/v1", "/api"):
    app.include_router(session_router, prefix=f"{prefix}/sessions")
    app.include_router(failures_router, prefix=f"{prefix}/failures")
    app.include_router(test_router, prefix=f"{prefix}/tests")
    app.include_router(agents_router, prefix=f"{prefix}/agents")


@app.get("/health")
@app.get("/api/health")
@app.get("/api/v1/health")
async def health_check():
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    return {
        "status": "ok",
        "service": "adversight-api",
        "version": "0.1.0",
        "geminiConfigured": bool(gemini_key),
    }
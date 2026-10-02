from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agents import router as agents_router
from app.api.failures import router as failures_router
from app.api.session import router as session_router
from app.api.test import router as test_router

# Dev origins for the Vite client. Promote to an env-driven setting once the
# API needs configuration beyond this.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

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
async def health_check():
    return {
        "status": "ok",
        "service": "adversight-api",
    }
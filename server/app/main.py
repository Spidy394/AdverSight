from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.session import router as session_router

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
    # No cookies or auth headers yet; credentials stay off so the origins can
    # be widened to "*" later without tripping the CORS spec.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session_router)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "adversight-api",
    }
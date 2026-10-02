from fastapi import FastAPI

app = FastAPI(
    title="AdverSight API",
    description="Autonomous Adversarial Testing API for AI Agents",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "adversight-api",
    }

# Session report export routes
from fastapi import APIRouter, HTTPException, status
from app.model.trace import SessionReport
from app.services import session_service as service
from app.services.session_report_builder import build_session_report

router = APIRouter(tags=['reports'])

@router.get('/{session_id}', response_model=SessionReport)
async def get_session_report(session_id: str) -> SessionReport:
    try:
        return await build_session_report(session_id)
    except service.SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

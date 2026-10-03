from app.model.trace import LogEvent as AppLogEvent, ReplayCase, SessionReport
from app.model.test import SessionSummary, TestResult
from app.services import session_service as service

async def build_session_report(session_id: str) -> SessionReport:
    record = await service.get_session(session_id)
    results = []
    for t in record.tests:
        results.append(TestResult(
            id=t.id,
            strategy=t.strategy.value if hasattr(t.strategy, 'value') else str(t.strategy),
            attack=t.attack,
            status=t.status,
            response=t.response,
            failure_type=t.failure_type,
            category=t.strategy,
            turns=[],
            needs_review=False,
        ))
    done = [r for r in results if r.status in ('passed', 'failed')]
    by_cat = {}
    for r in done:
        key = r.category.value if hasattr(r.category, 'value') else str(r.strategy)
        bucket = by_cat.setdefault(key, {'passed': 0, 'failed': 0})
        bucket[r.status] += 1
    summary = SessionSummary(
        total=len(results) or record.config.max_tests,
        completed=len(done),
        passed=sum(1 for r in done if r.status == 'passed'),
        failed=sum(1 for r in done if r.status == 'failed'),
        needs_review=0,
        by_category=by_cat,
    )
    replay_cases = []
    for i, f in enumerate(record.failures):
        replay_cases.append(ReplayCase(
            id=f.replay_case_id or f'replay_{i}',
            test_id=f.test_id,
            strategy=f.strategy.value if hasattr(f.strategy, 'value') else str(f.strategy),
            target_name=record.config.target_agent.name,
            attacker_messages=[f.attack] if f.attack else [],
            expected_failure_type=f.type,
            created_at=f.timestamp,
        ))
    logs = []
    for l in record.logs:
        try:
            logs.append(AppLogEvent(
                timestamp=l.timestamp,
                type=l.type.value if hasattr(l.type, 'value') else str(l.type),
                message=l.message,
            ))
        except Exception:
            pass
    return SessionReport(
        tests=results,
        failures=list(record.failures),
        logs=logs,
        summary=summary,
        replay_cases=replay_cases,
        adaptive_summary=None,
    )

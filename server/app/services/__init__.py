"""Engine services: attack generation, detection, evaluation, replay, trace collection."""
from app.services.attack_generator import AttackGenerator
from app.services.evaluator import Evaluator, summarize
from app.services.failure_detector import LLMJudge, default_detectors
from app.services.replay_service import build_failure, build_replay_case, replay
from app.services.testing_engine import TestRunner
from app.services.trace_collector import EvidenceStore, TraceCollector

__all__ = [
    "AttackGenerator", "Evaluator", "EvidenceStore", "LLMJudge", "TestRunner", "TraceCollector",
    "build_failure", "build_replay_case", "default_detectors", "replay", "summarize",
]

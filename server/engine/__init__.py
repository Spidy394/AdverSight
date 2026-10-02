"""AdverSight adversarial engine: attack generation, detection, evaluation, evidence/replay."""
from .attack_generator import AttackGenerator
from .evaluation import Evaluator, summarize
from .evidence_replay import EvidenceStore, build_failure, build_replay_case, replay
from .failure_detection import LLMJudge, default_detectors
from .interfaces import LLMClient, TargetAgent
from .models import *
from .runner import TestRunner

__all__ = [
    "AttackGenerator",
    "Evaluator",
    "EvidenceStore",
    "LLMClient",
    "LLMJudge",
    "TargetAgent",
    "TestRunner",
    "build_failure",
    "build_replay_case",
    "default_detectors",
    "replay",
    "summarize",
]

"""Trace collector: keeps failures + replay cases for a session, with JSON persistence."""
from __future__ import annotations

import json
from pathlib import Path

from app.model.failure import Failure
from app.model.trace import ReplayCase


class TraceCollector:
    """In-memory store with JSON persistence (Member 2 can swap this for a DB)."""

    def __init__(self) -> None:
        self.failures: dict[str, Failure] = {}
        self.replay_cases: dict[str, ReplayCase] = {}

    def add(self, failure: Failure, case: ReplayCase) -> None:
        self.failures[failure.id] = failure
        self.replay_cases[case.id] = case

    def save(self, path: str | Path) -> None:
        data = {
            "failures": [f.model_dump(by_alias=True, mode="json") for f in self.failures.values()],
            "replayCases": [c.model_dump(by_alias=True, mode="json") for c in self.replay_cases.values()],
        }
        Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> EvidenceStore:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        store = cls()
        for f in data["failures"]:
            store.failures[f["id"]] = Failure.model_validate(f)
        for c in data["replayCases"]:
            store.replay_cases[c["id"]] = ReplayCase.model_validate(c)
        return store


EvidenceStore = TraceCollector  # old name, kept so existing callers keep working

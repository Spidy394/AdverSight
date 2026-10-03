"""strategy_registry <-> attack_generator unification.

Guards the contract that the registry is the single source of truth: everything the generator
plans, escalates and mutates comes from it, so registering a strategy takes effect, and the
exploit-chain knowledge lives in exactly one place.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.model.test import AgentResponse, AttackCategory, TargetPolicy, TargetSpec, TestResult, Turn
from app.services.attack_generator import AttackGenerator
from app.services.demo_agents import FlightBookingAgent, flight_spec
from app.services.strategies import STRATEGIES, build_slots
from app.services.strategy_registry import (
    EXPLOIT_CHAIN,
    AttackStrategy,
    BaseTemplateStrategy,
    StrategyRegistry,
    chained_category,
    next_strategy,
    strategy_registry,
)
from app.services.testing_engine import TestRunner

ALL = list(AttackCategory)
SPEC = flight_spec()
C = AttackCategory


class CustomStrategy:
    """A user-defined strategy: nothing but the AttackStrategy protocol."""

    id = "custom_probe"
    category = C.TOOL_MISUSE
    description = "custom"
    seeds = ("CUSTOM-SEED one: {action}", "CUSTOM-SEED two: {asset}")
    escalations = ("CUSTOM-ESCALATION: {Action}",)

    def generate_probes(self, spec):
        return [s.format(action="x", Action="X", asset="y") for s in self.seeds]


def turn(attack: str, reply: str) -> Turn:
    return Turn(attack=attack, response=AgentResponse(text=reply))


# --------------------------------------------------------------------------- single source of truth
@pytest.mark.parametrize("cat", ALL)
def test_registry_probes_equal_what_the_generator_plans(cat):
    registry_first = strategy_registry.get(cat).generate_probes(SPEC)[0]
    planned = AttackGenerator(seed=1).plan(SPEC, [cat], 1)[0].attack
    assert registry_first == planned


def test_generate_probes_works_for_every_default_strategy():
    """Regression: generate_probes used to raise TypeError (render() is keyword-only)."""
    for strat in strategy_registry.list_all():
        probes = strat.generate_probes(SPEC)
        assert len(probes) == len(STRATEGIES[strat.category].seeds) > 0
        assert all(p.strip() and "{" not in p for p in probes), "unfilled template slot"


def test_slots_use_one_set_of_defaults_everywhere():
    bare = TargetSpec(name="x", domain="d", protected_actions=[], sensitive_assets=[], policy=TargetPolicy())
    slots = build_slots(bare)
    assert slots == {"action": "do the task", "asset": "the confidential records",
                     "key": "details", "value": "what I said"}
    assert AttackGenerator()._slots(bare) == slots


def test_registry_defaults_match_the_strategy_library():
    assert set(strategy_registry.categories()) == set(STRATEGIES) == set(AttackCategory)
    for cat, data in STRATEGIES.items():
        s = strategy_registry.require(cat)
        assert (s.id, s.seeds, s.escalations) == (data.id, data.seeds, data.escalations)
        assert isinstance(s, AttackStrategy)


# --------------------------------------------------------------------------- injected registry takes effect
def test_custom_strategy_drives_planning():
    reg = StrategyRegistry()
    reg.register(CustomStrategy())
    plan = AttackGenerator(registry=reg).plan(SPEC, [C.TOOL_MISUSE], 2)
    assert plan[0].strategy == "custom_probe" and plan[0].attack.startswith("CUSTOM-SEED one")
    assert plan[1].attack.startswith("CUSTOM-SEED two")


def test_custom_strategy_drives_escalation():
    reg = StrategyRegistry()
    reg.register(CustomStrategy())
    gen = AttackGenerator(registry=reg)
    sc = gen.plan(SPEC, [C.TOOL_MISUSE], 1)[0]
    t1 = [turn(sc.attack, "I'm sorry, I can't do that.")]
    t2 = t1 + [turn("again", "I'm sorry, I can't do that.")]
    assert "CUSTOM-ESCALATION" in gen.next_turn(sc, SPEC, t2)


def test_custom_strategy_drives_variants():
    reg = StrategyRegistry()
    reg.register(CustomStrategy())
    gen = AttackGenerator(registry=reg)
    sc = gen.plan(SPEC, [C.TOOL_MISUSE], 1)[0]
    v = gen.spawn_variant(sc, SPEC, "test_002")
    assert v is not None and v.derived_from == sc.id and v.category is C.TOOL_MISUSE
    assert v.attack != sc.attack


def test_injected_registry_does_not_leak_into_the_shared_default():
    reg = StrategyRegistry()
    reg.register(CustomStrategy())
    AttackGenerator(registry=reg).plan(SPEC, [C.TOOL_MISUSE], 1)
    assert strategy_registry.require(C.TOOL_MISUSE).id == "tool_misuse"
    assert "CUSTOM" not in AttackGenerator().plan(SPEC, [C.TOOL_MISUSE], 1)[0].attack


def test_a_full_session_runs_with_a_custom_registry():
    reg = StrategyRegistry()
    reg.register(CustomStrategy())
    rep = TestRunner(FlightBookingAgent(), SPEC, generator=AttackGenerator(registry=reg)).run(
        [C.TOOL_MISUSE, C.UNAUTHORIZED_ACTION], max_tests=4, max_turns=3)
    assert len(rep.tests) == 4
    assert any(t.attack.startswith("CUSTOM-SEED") for t in rep.tests)


# --------------------------------------------------------------------------- registry API
def test_require_gives_a_helpful_error_for_unregistered_categories():
    reg = StrategyRegistry(load_defaults=False)
    reg.register(CustomStrategy())
    with pytest.raises(KeyError, match="goal_hijacking.*registered: tool_misuse"):
        reg.require(C.GOAL_HIJACKING)
    with pytest.raises(KeyError, match="goal_hijacking"):
        AttackGenerator(registry=reg).plan(SPEC, [C.GOAL_HIJACKING], 1)


def test_category_of_resolves_ids_and_values():
    assert strategy_registry.category_of("policy_contradiction") is C.POLICY_VIOLATION  # id != value
    assert strategy_registry.category_of("tool_misuse") is C.TOOL_MISUSE
    assert strategy_registry.category_of("nope") is None


def test_partners_exclude_self_and_strategies_without_escalations():
    reg = StrategyRegistry(load_defaults=False)
    a, b = CustomStrategy(), CustomStrategy()
    b.id, b.category = "b", C.GOAL_HIJACKING
    c = CustomStrategy()
    c.id, c.category, c.escalations = "c", C.POLICY_VIOLATION, ()
    for s in (a, b, c):
        reg.register(s)
    assert [p.id for p in reg.partners(a)] == ["b"]


def test_generator_survives_a_registry_with_no_partners():
    """Injectable registries make 'no partner' reachable; it must degrade, not crash."""
    reg = StrategyRegistry(load_defaults=False)
    reg.register(CustomStrategy())
    gen = AttackGenerator(registry=reg)
    sc = gen.plan(SPEC, [C.TOOL_MISUSE], 1)[0]
    sc.max_turns = 6
    turns = []
    for i in range(4):  # deep enough to trigger composition (level >= 3)
        turns.append(turn(f"m{i}", "I'm sorry, I can't do that."))
        assert gen.next_turn(sc, SPEC, turns)  # never raises
    for _ in range(5):
        gen.spawn_variant(sc, SPEC, "test_009")  # exhausts seeds; must not raise


def test_base_template_strategy_exposes_the_protocol():
    s = BaseTemplateStrategy(STRATEGIES[C.IDENTITY_CONFUSION])
    assert isinstance(s, AttackStrategy) and s.seeds and s.escalations


# --------------------------------------------------------------------------- shared exploit chain
def test_next_strategy_follows_the_shared_chain():
    for src, dst in EXPLOIT_CHAIN.items():
        failed = TestResult(id="t", strategy=src.value, attack="a", status="failed", category=src)
        assert next_strategy(failed) is dst
        assert next_strategy(failed, available_categories=[src]) is src  # chain target not allowed -> stay


def test_next_strategy_rotates_on_pass_and_starts_at_first_allowed():
    assert next_strategy(None, [C.TOOL_MISUSE, C.GOAL_HIJACKING]) is C.TOOL_MISUSE
    passed = TestResult(id="t", strategy="x", attack="a", status="passed", category=C.TOOL_MISUSE)
    assert next_strategy(passed, [C.TOOL_MISUSE, C.GOAL_HIJACKING]) is C.GOAL_HIJACKING


def test_generator_prioritises_the_chained_category_right_after_a_failure():
    gen = AttackGenerator(seed=1)
    pending = gen.plan(SPEC, [C.TOOL_MISUSE, C.UNAUTHORIZED_ACTION, C.INFORMATION_EXTRACTION], 3)
    src = AttackGenerator(seed=1).plan(SPEC, [C.IDENTITY_CONFUSION], 1)[0]
    assert chained_category(C.IDENTITY_CONFUSION) is C.UNAUTHORIZED_ACTION
    before = [s.category for s in gen.prioritize(pending)]
    gen.record_outcome(src.strategy, True, scenario=src)
    after = [s.category for s in gen.prioritize(pending)]
    assert after[0] is C.UNAUTHORIZED_ACTION
    assert before != after or before[0] is C.UNAUTHORIZED_ACTION


def test_chain_bonus_needs_a_failure_and_expires_on_the_next_outcome():
    gen = AttackGenerator(seed=1)
    chained = gen.plan(SPEC, [C.UNAUTHORIZED_ACTION], 1)[0]
    src = gen.plan(SPEC, [C.IDENTITY_CONFUSION], 1)[0]
    base = gen._score(chained)
    gen.record_outcome(src.strategy, False, scenario=src)          # a PASS: no bonus
    assert gen._score(chained) == pytest.approx(base)
    gen.record_outcome(src.strategy, True, scenario=src)           # a failure: bonus
    with_bonus = gen._score(chained)
    assert with_bonus > base
    other = gen.plan(SPEC, [C.TOOL_MISUSE], 1)[0]
    gen.record_outcome(other.strategy, False, scenario=other)      # next outcome: bonus expires
    assert gen._score(chained) == pytest.approx(with_bonus - gen.CHAIN_BONUS)
    assert gen._last_outcome == (C.TOOL_MISUSE, False)


def test_record_outcome_without_a_scenario_resolves_the_category_via_the_registry():
    gen = AttackGenerator()
    gen.record_outcome("policy_contradiction", True)
    assert gen._last_outcome == (C.POLICY_VIOLATION, True)
    gen.record_outcome("not_a_strategy", True)
    assert gen._last_outcome is None


def test_default_behaviour_is_unchanged_for_secure_and_vulnerable_targets():
    secure = TestRunner(FlightBookingAgent(), SPEC).run(ALL, max_tests=14, max_turns=4)
    assert secure.summary.failed == 0 and secure.summary.passed == 14
    vuln = TestRunner(FlightBookingAgent(vulnerable=True, leaky=True), SPEC).run(ALL, max_tests=14, max_turns=4)
    assert vuln.summary.failed >= 10 and {f.severity for f in vuln.failures} & {"high", "critical"}


# --------------------------------------------------------------------------- /strategies endpoint
@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("path", ["/api/v1/strategies", "/api/strategies"])
def test_strategies_endpoint_lists_the_registry(client, path):
    r = client.get(path)
    assert r.status_code == 200
    data = r.json()
    assert [d["category"] for d in data] == [c.value for c in strategy_registry.categories()]
    assert set(data[0]) == {"category", "id", "label", "description", "probeCount"}
    assert all(d["probeCount"] > 0 and d["label"] and d["description"] for d in data)
    assert {d["category"] for d in data} == {c.value for c in AttackCategory}


def test_strategies_endpoint_reflects_registered_strategies(client):
    strategy_registry.register(CustomStrategy())
    try:
        data = {d["category"]: d for d in client.get("/api/v1/strategies").json()}
        assert data["tool_misuse"]["id"] == "custom_probe" and data["tool_misuse"]["probeCount"] == 2
    finally:
        strategy_registry.register(BaseTemplateStrategy(STRATEGIES[C.TOOL_MISUSE]))  # restore default

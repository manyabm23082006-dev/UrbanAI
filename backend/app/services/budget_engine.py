"""
Predictive Budget Planning — a transparent, rule-based estimate (not a
trained regressor, since there's no real historical repair dataset to
train on). Formula is documented inline so it's auditable, matching the
project's Explainable-AI approach elsewhere.
"""
COST_PER_REPAIR_INR = 175_000
WORKERS_PER_REPAIR = 3


def forecast(open_incidents: list, high_priority_count: int, critical_bridge_count: int = 0) -> dict:
    expected_repairs = max(len(open_incidents), 1)
    return {
        "expected_repairs": expected_repairs,
        "estimated_budget_inr": expected_repairs * COST_PER_REPAIR_INR,
        "workers_required": expected_repairs * WORKERS_PER_REPAIR,
        "high_risk_roads": high_priority_count,
        "critical_bridges": critical_bridge_count,
    }

"""
Explainable AI priority classifier for incidents/reports.
Rule-based (transparent, auditable) rather than a black box -- every
decision returns the reason, matching the "Explainable AI" requirement.
"""
CRITICAL_TYPES = {"accident", "bridge collapse", "road collapse", "flooding", "major obstruction"}
HIGH_TYPES = {"pothole", "road crack", "water leakage", "construction"}
MEDIUM_TYPES = {"streetlight", "drainage blockage", "traffic sign damage", "stall"}
LOW_TYPES = {"garbage overflow", "minor crack", "illegal parking"}


def classify(incident_type: str, severity: str = "Medium") -> tuple[str, str]:
    t = (incident_type or "").strip().lower()
    sev = (severity or "").strip().lower()

    if t in CRITICAL_TYPES or sev == "high" and t in {"accident", "flooding"}:
        return "Critical", f'"{incident_type}" matches a critical-danger category (immediate risk to life/traffic flow).'
    if t in HIGH_TYPES or sev == "high":
        return "High", f'"{incident_type}" is a high-impact infrastructure issue; reported severity is {severity}.'
    if t in MEDIUM_TYPES or sev == "medium":
        return "Medium", f'"{incident_type}" affects convenience/safety but is not immediately dangerous.'
    if t in LOW_TYPES:
        return "Low", f'"{incident_type}" is a low-urgency cosmetic/maintenance issue.'
    return "Monitoring", f'"{incident_type}" does not match a known high-urgency pattern; flagged for periodic review.'

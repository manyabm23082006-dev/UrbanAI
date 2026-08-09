"""
Medical Emergency priority classification and partial-resolution
aggregation. Rule-based and transparent (matches the rest of the app's
Explainable-AI pattern) -- explicitly does NOT diagnose medical
conditions, per the spec's own constraint; it only triages based on the
structured signals the reporter provided (unconscious/bleeding/ambulance
requested/people affected).
"""

def classify_priority(unconscious: bool, bleeding: bool, ambulance_required: bool, people_affected: int) -> tuple[str, str]:
    if unconscious or (bleeding and ambulance_required):
        return "Critical", "Unconscious and/or heavy bleeding with ambulance requested — immediate response required."
    if ambulance_required or bleeding or people_affected >= 3:
        return "High", "Ambulance requested, bleeding reported, or multiple people affected."
    if people_affected >= 1:
        return "Medium", "Injury reported without life-threatening indicators."
    return "Normal", "No injury indicators reported."


def overall_resolution_pct(e) -> int:
    return round((e.pct_response + e.pct_traffic_control + e.pct_team_arrived +
                  e.pct_patient_assistance + e.pct_road_clearance) / 5)


STATUS_FLOW = ["New", "Acknowledged", "Response Assigned", "Responding", "Arrived",
               "Assistance Provided", "Resolved"]
TERMINAL_ALT_STATUSES = ["Invalid Report", "Duplicate", "Transferred", "Cancelled"]
VALID_STATUSES = STATUS_FLOW + TERMINAL_ALT_STATUSES

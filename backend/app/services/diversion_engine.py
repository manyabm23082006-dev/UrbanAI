"""
Diversion recommendation — given an incident's coordinates and the set of
already-fetched route alternatives, recommend whichever route stays
farthest from the incident (real geometric clearance, not a guess).
"""
from .route_scoring import _haversine_m


def recommend_diversion(incident_lat: float, incident_lon: float, routes: list[list[list[float]]]) -> dict:
    clearances = []
    for coords in routes:
        if not coords:
            clearances.append(0.0)
            continue
        min_dist = min(_haversine_m(incident_lat, incident_lon, lat, lon) for lon, lat in coords)
        clearances.append(round(min_dist, 1))

    best_idx = max(range(len(clearances)), key=lambda i: clearances[i]) if clearances else 0
    reason = (f"Route {best_idx + 1} stays {clearances[best_idx]:.0f}m from the incident at minimum "
              f"— the largest clearance of the {len(clearances)} available alternatives.")
    return {"recommended_index": best_idx, "clearance_meters": clearances, "reason": reason}

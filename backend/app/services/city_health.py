"""
City Health Index — aggregates ward-level scores (or falls back to sane
defaults if no wards exist yet) into the single "Smart City Score" shown
on the Government dashboard.
"""
def aggregate(wards: list) -> dict:
    if not wards:
        return {"road_health": 80, "bridge_health": 85, "traffic_efficiency": 80,
                "drainage_health": 80, "streetlight_health": 85,
                "infrastructure_health": 82, "overall_score": 82}

    def avg(attr):
        return round(sum(getattr(w, attr) for w in wards) / len(wards))

    road = avg("road_health")
    bridge = avg("bridge_health")
    traffic = avg("traffic_efficiency")
    drainage = avg("drainage_health")
    streetlight = avg("streetlight_health")
    infra = round((road + bridge + drainage + streetlight) / 4)
    overall = round((road + bridge + traffic + drainage + streetlight) / 5)
    return {"road_health": road, "bridge_health": bridge, "traffic_efficiency": traffic,
            "drainage_health": drainage, "streetlight_health": streetlight,
            "infrastructure_health": infra, "overall_score": overall}


def ward_score(w) -> int:
    return round((w.road_health + w.bridge_health + w.traffic_efficiency +
                  w.drainage_health + w.streetlight_health) / 5)

"""Government dashboard: City Health Index + ward comparison + analytics."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from ...core.database import get_db
from ...models.models import Ward, TrafficRecord, Incident, User
from ...schemas.schemas import WardOut, CityHealthOut, AnalyticsOut, PeakHourOut, HotspotOut
from ...services.city_health import aggregate, ward_score
from ..deps import require_role, GOVERNMENT_ROLES

router = APIRouter(prefix="/api/v1/government", tags=["government"])


@router.get("/city-health", response_model=CityHealthOut)
def city_health(db: Session = Depends(get_db), _=Depends(require_role(*GOVERNMENT_ROLES))):
    wards = db.query(Ward).all()
    return aggregate(wards)


@router.get("/wards", response_model=list[WardOut])
def wards(db: Session = Depends(get_db), _=Depends(require_role(*GOVERNMENT_ROLES))):
    rows = db.query(Ward).all()
    out = []
    for w in rows:
        out.append(WardOut(
            id=w.id, name=w.name, road_health=w.road_health, bridge_health=w.bridge_health,
            traffic_efficiency=w.traffic_efficiency, drainage_health=w.drainage_health,
            streetlight_health=w.streetlight_health, budget_allocated=w.budget_allocated,
            budget_used=w.budget_used, overall_score=ward_score(w)))
    return out


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(db: Session = Depends(get_db), _=Depends(require_role(*GOVERNMENT_ROLES))):
    """Real SQL aggregations over existing data — no fabricated metrics.
    Peak hours and hotspots are computed fresh from TrafficRecord/Incident
    rows every call; deliberately NOT including a "citizen satisfaction
    score" here since there's no real feedback data source for it yet."""
    hour_col = extract("hour", TrafficRecord.timestamp)
    peak_rows = (db.query(hour_col.label("hour"), func.avg(TrafficRecord.density).label("avg_density"),
                           func.count(TrafficRecord.id).label("cnt"))
                 .group_by(hour_col).order_by(func.avg(TrafficRecord.density).desc()).limit(5).all())
    peak_hours = [PeakHourOut(hour=int(r.hour), avg_density=round(float(r.avg_density), 1),
                               record_count=r.cnt) for r in peak_rows]

    hotspot_rows = (db.query(Incident.location, func.count(Incident.id).label("cnt"))
                     .group_by(Incident.location).order_by(func.count(Incident.id).desc()).limit(5).all())
    hotspots = []
    for loc, cnt in hotspot_rows:
        top_type = (db.query(Incident.type, func.count(Incident.id).label("c"))
                    .filter(Incident.location == loc).group_by(Incident.type)
                    .order_by(func.count(Incident.id).desc()).first())
        hotspots.append(HotspotOut(location=loc, incident_count=cnt, most_common_type=top_type[0] if top_type else "Unknown"))

    active_users = db.query(func.count(User.id)).scalar() or 0
    total_incidents = db.query(func.count(Incident.id)).scalar() or 0

    completed = db.query(Incident).filter(Incident.status == "Completed").all()
    avg_hours = None
    if completed:
        deltas = [(i.updated_at - i.created_at).total_seconds() / 3600 for i in completed]
        avg_hours = round(sum(deltas) / len(deltas), 1)

    return AnalyticsOut(peak_hours=peak_hours, accident_hotspots=hotspots,
                         active_users=active_users, total_incidents=total_incidents,
                         avg_repair_hours=avg_hours)

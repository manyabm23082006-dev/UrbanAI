import random, string
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.models import Incident, IncidentEvent, Report, Notification, User
from ...schemas.schemas import (IncidentCreate, IncidentOut, IncidentStatusUpdate,
                                 IncidentStatusUpdateFull, IncidentEventOut)
from ...services.priority_engine import classify
from ..deps import require_role, get_current_user, POLICE_ROLES

router = APIRouter(prefix="/api/v1/incidents", tags=["incidents"])


def _gen_code():
    return "INC-" + "".join(random.choices(string.digits, k=6))


@router.get("", response_model=list[IncidentOut])
def list_incidents(db: Session = Depends(get_db)):
    return db.query(Incident).order_by(Incident.created_at.desc()).all()


@router.post("", response_model=IncidentOut, status_code=201)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db),
                     user: User = Depends(require_role(*POLICE_ROLES))):
    priority, reason = classify(payload.type, payload.severity)
    inc = Incident(code=_gen_code(), type=payload.type, location=payload.location,
                    lat=payload.lat, lon=payload.lon, severity=payload.severity,
                    priority=priority, delay_minutes=payload.delay_minutes, reason=reason)
    db.add(inc)
    db.flush()
    db.add(IncidentEvent(incident_id=inc.id, status=inc.status, changed_by_id=user.id,
                          department=user.role, remarks="Incident opened"))
    db.commit()
    db.refresh(inc)
    return inc


@router.patch("/{incident_id}/status", response_model=IncidentOut)
def update_status(incident_id: int, payload: IncidentStatusUpdateFull, db: Session = Depends(get_db),
                   user: User = Depends(require_role(*POLICE_ROLES))):
    """Updates status AND writes a permanent audit-trail event (Phase 14) --
    who changed it, from what department, when, and why. This is what
    powers GET /{id}/timeline; the old flat status column alone couldn't
    answer "who assigned this and when"."""
    inc = db.query(Incident).get(incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc.status = payload.status
    db.add(IncidentEvent(incident_id=inc.id, status=payload.status, changed_by_id=user.id,
                          department=user.role, remarks=payload.remarks))
    db.commit()
    db.refresh(inc)

    # Phase 14 -- notify the original reporter (if any) when their issue
    # moves to a meaningful milestone, matching "Repair Completion
    # Notifications" from the SRS notification list.
    if payload.status in ("Assigned", "Repair In Progress", "Completed"):
        report = db.query(Report).filter(Report.incident_id == inc.id).first()
        if report and report.reporter_id:
            db.add(Notification(
                user_id=report.reporter_id,
                title=f"📋 Your report {report.code} is now: {payload.status}",
                body=f"The incident you reported ({inc.type} at {inc.location}) has moved to '{payload.status}'."
                     + (f" Notes: {payload.remarks}" if payload.remarks else "")
            ))
            db.commit()
    return inc


@router.get("/{incident_id}/timeline", response_model=list[IncidentEventOut])
def incident_timeline(incident_id: int, db: Session = Depends(get_db),
                       _user: User = Depends(get_current_user)):
    """Internal audit trail (who changed status, department, remarks) --
    requires login. Was previously fully public, leaking officer remarks
    and department assignments to anyone with an incident ID."""
    events = (db.query(IncidentEvent).filter(IncidentEvent.incident_id == incident_id)
              .order_by(IncidentEvent.created_at.asc()).all())
    out = []
    for e in events:
        item = IncidentEventOut.model_validate(e)
        item.changed_by_name = e.changed_by.name if e.changed_by else "System"
        out.append(item)
    return out

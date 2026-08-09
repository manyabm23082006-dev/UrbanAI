"""
Medical Emergency module -- a separate portal (EMERGENCY_ROLES) with its
own scoped permissions. Operators see only what's needed for emergency
response: location, incident details, reporter's name/UrbanGuard ID, and
relevant traffic context. They do NOT get a generic User query -- there is
no endpoint here that returns Aadhaar, password hashes, challan history,
or unrelated citizens' complaints. That boundary is enforced by simply
never exposing those fields in EmergencyOut, not by a policy comment.
"""
import random, string
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.models import Emergency, EmergencyUpdate, ResponseUnit, User, Incident, Notification, EmergencyContact
from ...schemas.schemas import (EmergencyCreate, EmergencyOut, EmergencyCitizenOut, EmergencyStatusUpdate,
                                 EmergencyAssign, EmergencyResolutionUpdate, EmergencyUpdateOut, ResponseUnitOut,
                                 EmergencyContactCreate, EmergencyContactOut)
from ...services.emergency_engine import classify_priority, overall_resolution_pct, VALID_STATUSES
from ...services.diversion_engine import recommend_diversion
from ..deps import get_current_user, get_current_user_optional, require_role, EMERGENCY_ROLES, POLICE_ROLES

router = APIRouter(prefix="/api/v1/emergency", tags=["emergency"])


def _code():
    return "ER-UG-" + "".join(random.choices(string.digits, k=6))


def _to_out(e: Emergency) -> EmergencyOut:
    out = EmergencyOut.model_validate(e)
    out.overall_pct = overall_resolution_pct(e)
    out.reporter_name = e.reporter.name if e.reporter else "Unknown"
    out.reporter_urbanguard_id = e.reporter.urbanguard_id if e.reporter else None
    return out


# ---------- Citizen-facing ----------
@router.post("", response_model=EmergencyCitizenOut, status_code=201)
def report_emergency(payload: EmergencyCreate, db: Session = Depends(get_db),
                      user=Depends(get_current_user_optional)):
    priority, reason = classify_priority(payload.unconscious, payload.bleeding,
                                          payload.ambulance_required, payload.people_affected)
    e = Emergency(code=_code(), reporter_id=user.id if user else None, is_witness=payload.is_witness,
                  emergency_type=payload.emergency_type, lat=payload.lat, lon=payload.lon,
                  address_label=payload.address_label, description=payload.description,
                  photo_url=payload.photo_url, people_affected=payload.people_affected,
                  unconscious=payload.unconscious, bleeding=payload.bleeding,
                  ambulance_required=payload.ambulance_required, road_blocked=payload.road_blocked,
                  priority=priority)
    db.add(e)
    db.flush()
    db.add(EmergencyUpdate(emergency_id=e.id, status="New", note=f"Reported. {reason}"))

    # Notify the Medical Emergency role immediately -- this is the whole
    # point of a separate portal existing.
    db.add(Notification(audience_role="Emergency Operator", title=f"🚨 New emergency: {e.code}",
                         body=f"{payload.emergency_type} at {payload.address_label or 'reported location'} — "
                              f"priority {priority}. {payload.people_affected} affected."))

    # Notify the reporter's opted-in emergency contacts (real DB lookup,
    # not a fake SMS send -- there's no SMS provider in this environment;
    # this creates the message content and logs who *would* be notified).
    if user:
        contacts = db.query(EmergencyContact).filter(EmergencyContact.user_id == user.id,
                                                       EmergencyContact.notify_on_emergency == True).all()
        for c in contacts:
            db.add(Notification(
                user_id=user.id,  # logged against the reporter's own notification feed for visibility/audit
                title=f"📩 Emergency alert queued for {c.name}",
                body=f"Would notify {c.name} ({c.mobile}) — no SMS provider configured in this environment, "
                     f"so this is a logged simulation of that alert for {e.code}."
            ))
    db.commit()
    db.refresh(e)
    return EmergencyCitizenOut(code=e.code, emergency_type=e.emergency_type, status=e.status,
                                overall_pct=overall_resolution_pct(e), created_at=e.created_at)


@router.get("/mine", response_model=list[EmergencyCitizenOut])
def my_emergencies(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Phase 15: the citizen sees only a simplified status, never internal
    operator notes or other citizens' data."""
    rows = db.query(Emergency).filter(Emergency.reporter_id == user.id).order_by(Emergency.created_at.desc()).all()
    return [EmergencyCitizenOut(code=e.code, emergency_type=e.emergency_type, status=e.status,
                                 overall_pct=overall_resolution_pct(e), created_at=e.created_at) for e in rows]


@router.get("/first-aid")
def first_aid_guidance(situation: str = "general"):
    """Generic, safety-first guidance -- never a diagnosis, matching the
    spec's explicit constraint."""
    return {"guidance": [
        "Ensure your own safety first — move away from traffic if it's safe to do so.",
        "Call for professional medical assistance immediately if you haven't already.",
        "Don't move an injured person unnecessarily unless there's immediate danger (fire, oncoming traffic).",
        "If there's visible bleeding, apply firm pressure with a clean cloth.",
        "Keep the person still and calm; check they're breathing.",
        "Follow instructions from emergency professionals once they arrive or are on the line.",
    ], "disclaimer": "This is general safety guidance, not a medical diagnosis or a substitute for professional care."}


# ---------- Emergency Contacts (citizen profile) ----------
@router.get("/contacts", response_model=list[EmergencyContactOut])
def list_contacts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(EmergencyContact).filter(EmergencyContact.user_id == user.id).all()


@router.post("/contacts", response_model=EmergencyContactOut, status_code=201)
def add_contact(payload: EmergencyContactCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = EmergencyContact(user_id=user.id, **payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.query(EmergencyContact).filter(EmergencyContact.id == contact_id, EmergencyContact.user_id == user.id).first()
    if c:
        db.delete(c)
        db.commit()


# ---------- Medical Emergency Center (operator-facing) ----------
@router.get("/active", response_model=list[EmergencyOut])
def active_emergencies(db: Session = Depends(get_db), _=Depends(require_role(*EMERGENCY_ROLES))):
    rows = (db.query(Emergency).filter(~Emergency.status.in_(["Resolved", "Invalid Report", "Cancelled"]))
            .order_by(Emergency.created_at.desc()).all())
    return [_to_out(e) for e in rows]


@router.get("/history", response_model=list[EmergencyOut])
def emergency_history(db: Session = Depends(get_db), _=Depends(require_role(*EMERGENCY_ROLES))):
    rows = (db.query(Emergency).filter(Emergency.status.in_(["Resolved", "Invalid Report", "Cancelled"]))
            .order_by(Emergency.updated_at.desc()).limit(100).all())
    return [_to_out(e) for e in rows]


@router.get("/{emergency_id}", response_model=EmergencyOut)
def get_emergency(emergency_id: int, db: Session = Depends(get_db), _=Depends(require_role(*EMERGENCY_ROLES))):
    e = db.query(Emergency).get(emergency_id)
    if not e:
        raise HTTPException(404, "Emergency not found")
    return _to_out(e)


@router.get("/{emergency_id}/updates", response_model=list[EmergencyUpdateOut])
def emergency_updates(emergency_id: int, db: Session = Depends(get_db), _=Depends(require_role(*EMERGENCY_ROLES))):
    rows = (db.query(EmergencyUpdate).filter(EmergencyUpdate.emergency_id == emergency_id)
            .order_by(EmergencyUpdate.created_at.asc()).all())
    out = []
    for u in rows:
        item = EmergencyUpdateOut.model_validate(u)
        item.operator_name = u.operator.name if u.operator else "System"
        out.append(item)
    return out


@router.patch("/{emergency_id}/status", response_model=EmergencyOut)
def update_emergency_status(emergency_id: int, payload: EmergencyStatusUpdate, db: Session = Depends(get_db),
                             operator: User = Depends(require_role(*EMERGENCY_ROLES))):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
    e = db.query(Emergency).get(emergency_id)
    if not e:
        raise HTTPException(404, "Emergency not found")
    e.status = payload.status
    db.add(EmergencyUpdate(emergency_id=e.id, status=payload.status, note=payload.note, operator_id=operator.id))
    db.commit()
    db.refresh(e)
    return _to_out(e)


@router.post("/{emergency_id}/assign", response_model=EmergencyOut)
def assign_unit(emergency_id: int, payload: EmergencyAssign, db: Session = Depends(get_db),
                 operator: User = Depends(require_role(*EMERGENCY_ROLES))):
    e = db.query(Emergency).get(emergency_id)
    unit = db.query(ResponseUnit).get(payload.unit_id)
    if not e or not unit:
        raise HTTPException(404, "Emergency or response unit not found")
    e.assigned_unit_id = unit.id
    e.eta_minutes = payload.eta_minutes
    e.status = "Response Assigned"
    unit.status = "En Route"
    db.add(EmergencyUpdate(emergency_id=e.id, status="Response Assigned",
                            note=f"Assigned to {unit.call_sign}, ETA {payload.eta_minutes} min", operator_id=operator.id))
    db.commit()
    db.refresh(e)
    return _to_out(e)


@router.get("/units/available", response_model=list[ResponseUnitOut])
def available_units(db: Session = Depends(get_db), _=Depends(require_role(*EMERGENCY_ROLES))):
    return db.query(ResponseUnit).filter(ResponseUnit.status == "Available").all()


@router.patch("/{emergency_id}/resolution", response_model=EmergencyOut)
def update_resolution(emergency_id: int, payload: EmergencyResolutionUpdate, db: Session = Depends(get_db),
                       operator: User = Depends(require_role(*EMERGENCY_ROLES))):
    e = db.query(Emergency).get(emergency_id)
    if not e:
        raise HTTPException(404, "Emergency not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        if not (0 <= value <= 100):
            raise HTTPException(400, f"{field} must be between 0 and 100")
        setattr(e, field, value)
    db.commit()
    db.refresh(e)
    if overall_resolution_pct(e) == 100 and e.status != "Resolved":
        e.status = "Resolved"
        db.add(EmergencyUpdate(emergency_id=e.id, status="Resolved", note="All components reached 100% — auto-closed.", operator_id=operator.id))
        db.commit()
        db.refresh(e)
    return _to_out(e)


@router.post("/{emergency_id}/flag-infrastructure", response_model=EmergencyOut)
def flag_infrastructure(emergency_id: int, db: Session = Depends(get_db),
                         operator: User = Depends(require_role(*EMERGENCY_ROLES))):
    """Phase 16: operator identifies the emergency was caused by an
    infrastructure problem (e.g. a damaged barrier) and forwards it as a
    real tracked Incident for Municipality, reusing the existing
    Explainable-AI priority engine."""
    from ...services.priority_engine import classify
    e = db.query(Emergency).get(emergency_id)
    if not e:
        raise HTTPException(404, "Emergency not found")
    priority, reason = classify("Infrastructure Damage", "High")
    inc = Incident(code=f"INC-{random.randint(100000,999999)}", type="Infrastructure Damage (Emergency-linked)",
                    location=e.address_label or "Emergency location", lat=e.lat, lon=e.lon,
                    severity="High", priority=priority,
                    reason=f"Flagged by emergency operator during {e.code}: {reason}")
    db.add(inc)
    db.flush()
    e.infrastructure_flagged = True
    e.incident_id = inc.id
    db.add(EmergencyUpdate(emergency_id=e.id, status=e.status, note=f"Infrastructure issue flagged -> {inc.code}", operator_id=operator.id))
    db.commit()
    db.refresh(e)
    return _to_out(e)


@router.get("/{emergency_id}/diversion")
def emergency_diversion(emergency_id: int, routes: str, db: Session = Depends(get_db),
                         _=Depends(require_role(*EMERGENCY_ROLES, *POLICE_ROLES))):
    """Reuses the same real diversion-engine geometry used for citizen
    routing, framed as an emergency corridor recommendation. `routes` is a
    JSON string of route coordinate arrays (same shape the frontend
    already fetched for the citizen's route)."""
    import json
    e = db.query(Emergency).get(emergency_id)
    if not e or e.lat is None:
        raise HTTPException(404, "Emergency not found or has no location")
    try:
        route_coords = json.loads(routes)
    except Exception:
        raise HTTPException(400, "routes must be a JSON-encoded list of coordinate arrays")
    result = recommend_diversion(e.lat, e.lon, route_coords)
    return {"emergency_code": e.code, **result}

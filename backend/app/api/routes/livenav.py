"""
Live Navigation visibility (Phase 6) — when a citizen starts navigation,
Traffic Control receives their route/ETA in real time so the control room
can monitor congestion and issue advisories, per the SRS. This is genuine
per-session tracking (not simulated): a row is created on start, closed on
stop, and Traffic Control queries active sessions directly.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.models import LiveNavigation, User
from ...schemas.schemas import LiveNavStart, LiveNavOut
from ..deps import get_current_user, require_role, POLICE_ROLES

router = APIRouter(prefix="/api/v1/live-nav", tags=["live-navigation"])


@router.post("/start", response_model=LiveNavOut, status_code=201)
def start_navigation(payload: LiveNavStart, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nav = LiveNavigation(citizen_id=user.id, **payload.model_dump())
    db.add(nav)
    db.commit()
    db.refresh(nav)
    out = LiveNavOut.model_validate(nav)
    out.citizen_name = user.name
    return out


@router.post("/{nav_id}/stop", status_code=204)
def stop_navigation(nav_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nav = db.query(LiveNavigation).filter(LiveNavigation.id == nav_id, LiveNavigation.citizen_id == user.id).first()
    if not nav:
        raise HTTPException(404, "Navigation session not found")
    nav.status = "Completed"
    nav.ended_at = datetime.utcnow()
    db.commit()


@router.get("/active", response_model=list[LiveNavOut])
def active_navigations(db: Session = Depends(get_db), _=Depends(require_role(*POLICE_ROLES))):
    """Traffic Control's live feed of every citizen currently navigating."""
    rows = db.query(LiveNavigation).filter(LiveNavigation.status == "Active").order_by(LiveNavigation.started_at.desc()).all()
    out = []
    for r in rows:
        item = LiveNavOut.model_validate(r)
        item.citizen_name = r.citizen.name if r.citizen else "Unknown"
        out.append(item)
    return out

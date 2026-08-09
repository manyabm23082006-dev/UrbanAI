import random
import string
import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from ...core.database import get_db
from ...models.models import Report, Incident, Notification, User
from ...schemas.schemas import ReportCreate, ReportOut, ReportPublicOut, PhotoUploadOut
from ...services.priority_engine import classify
from ...services.route_scoring import _haversine_m
from ..deps import get_current_user_optional, get_current_user, require_role, POLICE_ROLES, MUNICIPALITY_ROLES

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

STAFF_REPORT_ROLES = tuple(sorted(set(POLICE_ROLES) | set(MUNICIPALITY_ROLES)))

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
RECURRENCE_RADIUS_M = 150  # reports within this radius + same category count as "the same spot"

FIRST_AID_GUIDANCE = (
    "Stay calm. Do not move an injured person unless they are in immediate danger "
    "(e.g. fire, oncoming traffic). Keep them still, check they are breathing, and apply "
    "firm pressure to any visible bleeding with a clean cloth. Keep bystanders back to give "
    "them air. Emergency services have been alerted to this location — stay on the line if "
    "you called one, and wait for professional help to arrive."
)


def _code(prefix: str) -> str:
    """Generates a random unique resource code."""
    return f"{prefix}-" + "".join(random.choices(string.digits, k=6))


def _recurrence_count(db: Session, category: str, lat: Optional[float], lon: Optional[float]) -> Optional[int]:
    """Calculates how many past reports of the same category exist within RECURRENCE_RADIUS_M."""
    if lat is None or lon is None:
        return None
    candidates = db.query(Report).filter(
        Report.category == category,
        Report.lat.isnot(None),
        Report.lon.isnot(None)
    ).all()
    count = sum(1 for r in candidates if _haversine_m(lat, lon, r.lat, r.lon) <= RECURRENCE_RADIUS_M)
    return count


@router.post("/upload-photo", response_model=PhotoUploadOut, status_code=201)
async def upload_photo(file: UploadFile = File(...)):
    """Saves a user-uploaded image to disk and returns a relative file URL path."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"Unsupported image type: {file.content_type}")
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}[file.content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOAD_DIR, filename)
    contents = await file.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 8MB")
    with open(dest, "wb") as f:
        f.write(contents)
    return PhotoUploadOut(url=f"/uploads/{filename}")


@router.get("", response_model=list[ReportOut])
def list_reports(
    db: Session = Depends(get_db),
    staff: User = Depends(require_role(*STAFF_REPORT_ROLES))
):
    """Retrieves full details of all hazard/infrastructure reports (Staff and Admin restricted)."""
    return db.query(Report).order_by(Report.created_at.desc()).all()


@router.get("/mine", response_model=list[ReportOut])
def my_reports(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Retrieves all reports submitted by the currently logged-in citizen."""
    return (
        db.query(Report)
        .filter(Report.reporter_id == user.id)
        .order_by(Report.created_at.desc())
        .all()
    )


@router.get("/public", response_model=list[ReportPublicOut])
def public_reports(db: Session = Depends(get_db)):
    """Provides an unauthenticated, privacy-sanitized view of recent community reports."""
    return db.query(Report).order_by(Report.created_at.desc()).all()


@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """Submits a fresh traffic hazard or infrastructure defect report, triggering auto-escalations."""
    recurrence = _recurrence_count(db, payload.category, payload.lat, payload.lon)

    report = Report(
        code=_code("RPT"),
        category=payload.category,
        level=payload.level,
        note=payload.note,
        lat=payload.lat,
        lon=payload.lon,
        address_label=payload.address_label,
        photo_url=payload.photo_url,
        reporter_id=user.id if user else None,
        injuries_reported=payload.injuries_reported,
        ambulance_required=payload.ambulance_required,
        road_blocked=payload.road_blocked
    )

    is_emergency = payload.category == "Accident" and (payload.injuries_reported or payload.ambulance_required)

    priority, reason = classify(payload.category, "High" if payload.level == "Heavy" else "Medium")
    if is_emergency:
        priority = "Critical"
        details = []
        if payload.injuries_reported:
            details.append("injuries reported")
        if payload.ambulance_required:
            details.append("ambulance requested")
        if payload.road_blocked:
            details.append("road blocked")
        reason = f"Accident report flagged as a medical emergency ({', '.join(details)}) — auto-escalated to Critical."
    elif recurrence and recurrence >= 3:
        reason = f"{reason} Reported {recurrence} times at this location — recurring issue."

    if priority in ("Critical", "High"):
        inc = Incident(
            code=_code("INC"),
            type=payload.category,
            location=payload.address_label or "Citizen-reported location",
            lat=payload.lat,
            lon=payload.lon,
            severity=payload.level or "Medium",
            priority=priority,
            reason=reason
        )
        db.add(inc)
        db.flush()
        report.incident_id = inc.id

        if is_emergency:
            db.add(Notification(
                audience_role="Traffic Engineer",
                title="🚨 Medical emergency — accident report",
                body=(
                    f"Accident reported with injuries/ambulance need at "
                    f"({payload.lat}, {payload.lon}). Incident {inc.code} opened as Critical. "
                    f"Recommend emergency corridor and immediate dispatch coordination."
                )
            ))

    db.add(report)
    db.commit()
    db.refresh(report)

    out = ReportOut.model_validate(report)
    out.recurrence_count = recurrence
    if is_emergency:
        out.first_aid_guidance = FIRST_AID_GUIDANCE
    return out
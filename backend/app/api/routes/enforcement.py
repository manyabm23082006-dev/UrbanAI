"""Traffic Police: AI-flagged violations + e-challan lifecycle + vehicle lookup."""
import random
import string
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from ...core.database import get_db
from ...models.models import Violation, Challan, Vehicle, VehicleInspection, Notification, User
from ...schemas.schemas import (
    ViolationCreate,
    ViolationOut,
    ChallanOut,
    VehicleLookupOut,
    InspectionCreate,
    ControlRoomNotify
)
from ..deps import require_role, get_current_user, POLICE_ROLES
from .vehicles import _refresh_doc_status

router = APIRouter(prefix="/api/v1/enforcement", tags=["enforcement"])


def _code(prefix: str) -> str:
    """Generates a random formatted code string for records."""
    return f"{prefix}-" + "".join(random.choices(string.digits, k=6))


CHALLAN_AMOUNTS = {
    "Helmet": 500,
    "Seatbelt": 500,
    "Wrong-way Driving": 1000,
    "Red-light Jump": 1000,
    "Illegal Parking": 300,
    "Lane Discipline": 500,
    "Speeding": 1500,
}


@router.get("/violations", response_model=list[ViolationOut])
def list_violations(
    db: Session = Depends(get_db),
    _=Depends(require_role(*POLICE_ROLES))
):
    """Retrieves all logged traffic violations sorted by creation date descending."""
    return db.query(Violation).order_by(Violation.created_at.desc()).all()


@router.post("/violations", response_model=ViolationOut, status_code=201)
def record_violation(
    payload: ViolationCreate,
    db: Session = Depends(get_db),
    officer: User = Depends(require_role(*POLICE_ROLES))
):
    """Records a new traffic violation and auto-issues an e-challan linked to it."""
    vehicle = db.query(Vehicle).filter(Vehicle.reg_number == payload.reg_number_text).first()
    v = Violation(
        code=_code("VIO"),
        vehicle_id=vehicle.id if vehicle else None,
        reg_number_text=payload.reg_number_text,
        violation_type=payload.violation_type,
        location=payload.location,
        confidence=payload.confidence,
        officer_id=officer.id
    )
    db.add(v)
    db.flush()

    amount = CHALLAN_AMOUNTS.get(payload.violation_type, 500)
    challan = Challan(code=_code("CHL"), violation_id=v.id, amount=amount)
    db.add(challan)
    db.commit()
    db.refresh(v)
    return v


@router.patch("/challans/{challan_id}/pay", response_model=ChallanOut)
def pay_challan(
    challan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Marks a specific challan as paid. Gated by ownership or administrative staff roles."""
    c = db.query(Challan).get(challan_id)
    if not c:
        raise HTTPException(404, "Challan not found")

    is_staff = user.role in POLICE_ROLES or user.role == "admin"
    owns_vehicle = (c.violation and c.violation.vehicle and c.violation.vehicle.owner_id == user.id)
    if not (is_staff or owns_vehicle):
        raise HTTPException(403, "You can only pay challans issued against your own vehicle")

    if c.status == "Paid":
        raise HTTPException(400, "Challan is already paid")

    c.status = "Paid"
    c.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return c


@router.get("/lookup", response_model=VehicleLookupOut)
def lookup_vehicle(
    reg_number: str,
    db: Session = Depends(get_db),
    _=Depends(require_role(*POLICE_ROLES))
):
    """Performs an authorized police database lookup for a vehicle by registration number."""
    v = db.query(Vehicle).filter(Vehicle.reg_number == reg_number).first()
    if not v:
        return VehicleLookupOut(
            reg_number=reg_number,
            found=False,
            alerts=["No record found in this platform's database."]
        )
    for d in v.documents:
        _refresh_doc_status(d)
    db.commit()
    alerts = []
    for d in v.documents:
        if d.status == "Expired":
            alerts.append(f"{d.doc_type} EXPIRED")
        elif d.status == "Expiring Soon":
            alerts.append(f"{d.doc_type} expiring within 30 days")
    return VehicleLookupOut(
        reg_number=v.reg_number,
        found=True,
        owner_name=v.owner.name,
        vehicle_type=v.vehicle_type,
        documents=v.documents,
        alerts=alerts or ["No alerts — documents in order."],
        violations=v.violations
    )


@router.get("/flagged-vehicles")
def flagged_vehicles(
    db: Session = Depends(get_db),
    _=Depends(require_role(*POLICE_ROLES))
):
    """Lists platform-wide vehicles containing expired or soon-to-expire documentation."""
    vehicles = db.query(Vehicle).all()
    out = []
    for v in vehicles:
        for d in v.documents:
            _refresh_doc_status(d)
        flagged_docs = [d for d in v.documents if d.status in ("Expired", "Expiring Soon")]
        if flagged_docs:
            out.append({
                "vehicle_id": v.id,
                "reg_number": v.reg_number,
                "owner_name": v.owner.name if v.owner else "Unknown",
                "vehicle_type": v.vehicle_type,
                "flagged_documents": [
                    {
                        "doc_type": d.doc_type,
                        "status": d.status,
                        "expires_on": d.expires_on.isoformat() if d.expires_on else None
                    }
                    for d in flagged_docs
                ],
            })
    out.sort(key=lambda item: 0 if any(d["status"] == "Expired" for d in item["flagged_documents"]) else 1)
    db.commit()
    return out


@router.get("/my-challans", response_model=list[ViolationOut])
def my_challans(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Retrieves all violations and challans linked to vehicles owned by the logged-in citizen."""
    vehicle_ids = [v.id for v in db.query(Vehicle).filter(Vehicle.owner_id == user.id).all()]
    if not vehicle_ids:
        return []
    return (
        db.query(Violation)
        .filter(Violation.vehicle_id.in_(vehicle_ids))
        .order_by(Violation.created_at.desc())
        .all()
    )


@router.post("/vehicles/{reg_number}/inspect", status_code=201)
def mark_vehicle_inspected(
    reg_number: str,
    payload: InspectionCreate,
    db: Session = Depends(get_db),
    officer: User = Depends(require_role(*POLICE_ROLES))
):
    """Logs a routine roadside vehicle/document compliance inspection without issuing a fine."""
    vehicle = db.query(Vehicle).filter(Vehicle.reg_number == reg_number).first()
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")
    insp = VehicleInspection(vehicle_id=vehicle.id, officer_id=officer.id, notes=payload.notes)
    db.add(insp)
    db.commit()
    return {"status": "recorded", "vehicle": reg_number, "officer": officer.name}


@router.post("/notify-control-room", status_code=201)
def notify_control_room(
    payload: ControlRoomNotify,
    db: Session = Depends(get_db),
    officer: User = Depends(require_role(*POLICE_ROLES))
):
    """Dispatches a direct real-time alert message to the Traffic Control Room."""
    db.add(Notification(
        audience_role="Traffic Engineer",
        title=f"📢 Control room alert from {officer.name}",
        body=payload.message + (f" (Vehicle: {payload.reg_number})" if payload.reg_number else "")
    ))
    db.commit()
    return {"status": "sent"}
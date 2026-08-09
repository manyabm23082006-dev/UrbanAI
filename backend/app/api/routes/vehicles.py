"""Citizen Smart Mobility: vehicles + digital documents (RC/Insurance/PUC/Licence)."""
import random, string
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.models import Vehicle, VehicleDocument, User, Notification
from ...schemas.schemas import VehicleCreate, VehicleOut, VehicleDocumentCreate, VehicleDocumentOut
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/vehicles", tags=["vehicles"])

NOTIF_TITLES = {
    "Insurance": "Insurance renewal reminder", "PUC": "PUC expiry reminder",
    "Licence": "Driving licence renewal reminder", "RC": "RC expiry reminder",
    "Fitness": "Fitness certificate renewal reminder",
}


def _refresh_doc_status(doc: VehicleDocument):
    if not doc.expires_on:
        doc.status = "Valid"
        return
    expires = doc.expires_on
    # Browser-sent dates arrive as timezone-aware ("...Z"); DB-stored values
    # are naive. Normalize both to naive UTC before subtracting so this
    # never raises "can't subtract offset-naive and offset-aware datetimes".
    if expires.tzinfo is not None:
        expires = expires.replace(tzinfo=None)
    days_left = (expires - datetime.utcnow()).days
    doc.status = "Expired" if days_left < 0 else "Expiring Soon" if days_left <= 30 else "Valid"


def _refresh_and_notify(db: Session, doc: VehicleDocument, owner_id: int):
    """Refresh a document's status and, if it just crossed into Expiring
    Soon or Expired, create a real Notification for the owner -- once per
    status transition (last_notified_status is the dedup key), not once
    per page load."""
    _refresh_doc_status(doc)
    if doc.status in ("Expiring Soon", "Expired") and doc.status != doc.last_notified_status:
        title = NOTIF_TITLES.get(doc.doc_type, f"{doc.doc_type} document alert")
        urgency = "has expired" if doc.status == "Expired" else "expires within 30 days"
        db.add(Notification(
            user_id=owner_id, title=f"⚠️ {title}",
            body=f"Your {doc.doc_type} ({doc.doc_number or 'no number on file'}) {urgency}. "
                 f"Renew it to stay compliant and avoid an e-Challan if stopped by Traffic Police."
        ))
        doc.last_notified_status = doc.status


@router.get("", response_model=list[VehicleOut])
def my_vehicles(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vehicles = db.query(Vehicle).filter(Vehicle.owner_id == user.id).all()
    for v in vehicles:
        for d in v.documents:
            _refresh_and_notify(db, d, user.id)
    db.commit()
    return vehicles


@router.post("", response_model=VehicleOut, status_code=201)
def add_vehicle(payload: VehicleCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if db.query(Vehicle).filter(Vehicle.reg_number == payload.reg_number).first():
        raise HTTPException(400, "A vehicle with this registration number already exists")
    # Phase 1 (SRS): each citizen may register only one primary vehicle.
    if user.role == "Citizen" and db.query(Vehicle).filter(Vehicle.owner_id == user.id).first():
        raise HTTPException(400, "Vehicle already registered. One vehicle can only be linked to one primary user.")
    v = Vehicle(owner_id=user.id, **payload.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.delete("/{vehicle_id}", status_code=204)
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.owner_id == user.id).first()
    if not v:
        raise HTTPException(404, "Vehicle not found")
    db.delete(v)
    db.commit()


@router.post("/{vehicle_id}/documents", response_model=VehicleDocumentOut, status_code=201)
def add_document(vehicle_id: int, payload: VehicleDocumentCreate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.owner_id == user.id).first()
    if not v:
        raise HTTPException(404, "Vehicle not found")
    
    # payload.model_dump() now automatically includes file_url if provided by the citizen upload form
    doc = VehicleDocument(vehicle_id=v.id, **payload.model_dump())
    _refresh_doc_status(doc)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/expiring", response_model=list[VehicleDocumentOut])
def expiring_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Powers the document-expiry reminder list."""
    vehicles = db.query(Vehicle).filter(Vehicle.owner_id == user.id).all()
    docs = []
    for v in vehicles:
        for d in v.documents:
            _refresh_and_notify(db, d, user.id)
            if d.status in ("Expiring Soon", "Expired"):
                docs.append(d)
    db.commit()
    return docs
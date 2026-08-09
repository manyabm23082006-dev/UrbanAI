"""Saved/starred places -- Google-Maps-style bookmarking, per citizen."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.models import SavedPlace, User
from ...schemas.schemas import SavedPlaceCreate, SavedPlaceOut
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/places", tags=["places"])


@router.get("", response_model=list[SavedPlaceOut])
def list_saved_places(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(SavedPlace).filter(SavedPlace.user_id == user.id).order_by(SavedPlace.created_at.desc()).all()


@router.post("", response_model=SavedPlaceOut, status_code=201)
def save_place(payload: SavedPlaceCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    place = SavedPlace(user_id=user.id, **payload.model_dump())
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


@router.delete("/{place_id}", status_code=204)
def delete_saved_place(place_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    place = db.query(SavedPlace).filter(SavedPlace.id == place_id, SavedPlace.user_id == user.id).first()
    if not place:
        raise HTTPException(404, "Saved place not found")
    db.delete(place)
    db.commit()

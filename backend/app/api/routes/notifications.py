from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ...core.database import get_db
from ...models.models import Notification, User
from ...schemas.schemas import NotificationOut
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def my_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Notifications addressed directly to this user, or broadcast to their role."""
    return (db.query(Notification)
            .filter(or_(Notification.user_id == user.id, Notification.audience_role == user.role))
            .order_by(Notification.created_at.desc())
            .limit(50).all())


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Only the notification's own recipient (by user_id, or by matching
    audience_role for role-broadcast notifications) may mark it read --
    previously any logged-in user could flip this flag on anyone else's
    notification just by guessing an ID."""
    n = db.query(Notification).get(notification_id)
    if not n or not (n.user_id == user.id or n.audience_role == user.role):
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n

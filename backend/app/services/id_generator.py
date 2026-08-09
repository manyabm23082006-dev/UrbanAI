"""
UrbanGuard ID generation — format UG-<year>-<state code>-<sequence>,
e.g. UG-2026-KA-000001. The sequence is per-state-per-year so IDs stay
short and readable while remaining globally unique via the DB constraint.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func

STATE_CODES = {
    "karnataka": "KA", "maharashtra": "MH", "delhi": "DL", "tamil nadu": "TN",
    "telangana": "TG", "kerala": "KL", "west bengal": "WB", "gujarat": "GJ",
    "rajasthan": "RJ", "uttar pradesh": "UP", "punjab": "PB", "haryana": "HR",
}


def generate_urbanguard_id(db: Session, state: str | None) -> str:
    from ..models.models import User  # local import avoids circular import
    year = datetime.utcnow().year
    code = STATE_CODES.get((state or "").strip().lower(), "IN")
    prefix = f"UG-{year}-{code}-"
    count = db.query(func.count(User.id)).filter(User.urbanguard_id.like(f"{prefix}%")).scalar() or 0
    seq = str(count + 1).zfill(6)
    candidate = f"{prefix}{seq}"
    # Extremely defensive uniqueness loop in case of a race condition
    while db.query(User).filter(User.urbanguard_id == candidate).first():
        count += 1
        candidate = f"{prefix}{str(count + 1).zfill(6)}"
    return candidate


def generate_temp_password() -> str:
    import secrets
    return secrets.token_urlsafe(6)

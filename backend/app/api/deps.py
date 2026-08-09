from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import decode_token
from ..models.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# Centralized role groups -- single source of truth so every endpoint
# that gates a dashboard uses the exact same definition of "who's allowed".
POLICE_ROLES = ("admin", "Traffic Engineer", "Emergency Manager")
MUNICIPALITY_ROLES = ("admin", "City Planner", "Traffic Engineer", "Analyst")
GOVERNMENT_ROLES = ("admin", "City Planner", "Analyst")
EMERGENCY_ROLES = ("admin", "Emergency Operator")  # Medical Emergency portal — deliberately separate from POLICE_ROLES


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    cred_err = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing credentials")
    if not token:
        raise cred_err
    payload = decode_token(token)
    if not payload:
        raise cred_err
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise cred_err
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise cred_err
    return user


def get_current_user_optional(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Like get_current_user but returns None instead of raising -- for
    endpoints (e.g. citizen reports) that work both logged-in and anonymous."""
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None
    return db.query(User).filter(User.id == user_id).first()


def require_role(*roles: str):
    def _checker(user: User = Depends(get_current_user)) -> User:
        if roles and user.role not in roles and user.role != "admin":
            raise HTTPException(status_code=403, detail="Insufficient role permissions")
        return user
    return _checker

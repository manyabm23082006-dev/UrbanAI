from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from .config import settings

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# bcrypt has always had a hard 72-BYTE input limit. Older bcrypt releases
# silently truncated anything past that; bcrypt>=4.1 raises ValueError
# instead, which also breaks passlib's own backend version-probe on
# import in some environments. We defend against both by truncating to
# 72 bytes ourselves before ever handing the password to passlib/bcrypt.
_BCRYPT_MAX_BYTES = 72


def _truncate_to_bcrypt_limit(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) <= _BCRYPT_MAX_BYTES:
        return password
    # Truncate on a byte boundary, then decode back, dropping any
    # partial multi-byte character left dangling at the cut point.
    return encoded[:_BCRYPT_MAX_BYTES].decode("utf-8", errors="ignore")


def hash_password(password: str) -> str:
    return pwd_ctx.hash(_truncate_to_bcrypt_limit(password))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(_truncate_to_bcrypt_limit(plain), hashed)


def create_access_token(subject: str, role: str, expires_minutes: Optional[int] = None) -> str:
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def create_short_lived_token(claims: dict, expires_minutes: int) -> str:
    """General-purpose short-lived JWT for things that aren't a login
    session -- e.g. proof that an OTP was verified for a given phone
    number, used to gate document upload / final registration submit
    without requiring a full user account (which doesn't exist yet)."""
    to_encode = dict(claims)
    to_encode["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

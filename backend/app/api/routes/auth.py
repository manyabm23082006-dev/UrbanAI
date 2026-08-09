import random, os, uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import hash_password, verify_password, create_access_token, create_short_lived_token, decode_token
from ...core.config import settings
from ...models.models import User, OTPRequest, Vehicle, VehicleDocument
from ...schemas.schemas import (UserCreate, LoginRequest, Token, UserOut,
                                 CitizenRegister, CitizenRegisterOut, ChangePasswordRequest,
                                 AvailabilityCheck, OTPRequestIn, OTPVerifyIn, OTPVerifyOut)
from ...services.id_generator import generate_urbanguard_id, generate_temp_password
from ...services.sms_service import send_sms, SMSDeliveryError
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

REG_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "registration")
os.makedirs(REG_UPLOAD_DIR, exist_ok=True)
ALLOWED_DOC_TYPES = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"
}


def _issue_token(user: User) -> Token:
    token = create_access_token(str(user.id), user.role)
    return Token(access_token=token, user=UserOut.model_validate(user))


# ════════════════════════════════════════════════════════════════
# AVAILABILITY CHECK -- live "already registered" validation as the
# citizen types, so they find out immediately which field collided
# instead of only at final submit.
# ════════════════════════════════════════════════════════════════
@router.get("/check-availability", response_model=AvailabilityCheck)
def check_availability(email: str | None = None, mobile: str | None = None,
                        govt_id_number: str | None = None, vehicle_reg_number: str | None = None,
                        db: Session = Depends(get_db)):
    out = AvailabilityCheck()
    if email:
        out.email_taken = db.query(User).filter(User.email == email).first() is not None
    if mobile:
        out.mobile_taken = db.query(User).filter(User.mobile == mobile).first() is not None
    if govt_id_number:
        out.govt_id_taken = db.query(User).filter(User.govt_id_number == govt_id_number).first() is not None
    if vehicle_reg_number:
        reg = vehicle_reg_number.strip().upper().replace(" ", "")
        out.vehicle_reg_taken = db.query(Vehicle).filter(Vehicle.reg_number == reg).first() is not None
    return out


# ════════════════════════════════════════════════════════════════
# OTP -- mobile verification via real SMS (or console-log in dev mode,
# see sms_service.py). Rate-limited per phone number.
# ════════════════════════════════════════════════════════════════
@router.post("/otp/request")
def request_otp(payload: OTPRequestIn, db: Session = Depends(get_db)):
    phone = payload.mobile.strip()
    if not phone:
        raise HTTPException(400, "Mobile number is required")

    now = datetime.utcnow()
    recent = (db.query(OTPRequest)
              .filter(OTPRequest.phone == phone, OTPRequest.purpose == payload.purpose)
              .order_by(OTPRequest.created_at.desc()).first())
    if recent:
        seconds_since = (now - recent.created_at).total_seconds()
        if seconds_since < settings.OTP_RESEND_COOLDOWN_SECONDS:
            wait = int(settings.OTP_RESEND_COOLDOWN_SECONDS - seconds_since)
            raise HTTPException(429, f"Please wait {wait}s before requesting another code")

    hour_ago = now - timedelta(hours=1)
    count_last_hour = (db.query(OTPRequest)
                       .filter(OTPRequest.phone == phone, OTPRequest.purpose == payload.purpose,
                               OTPRequest.created_at >= hour_ago).count())
    if count_last_hour >= settings.OTP_MAX_PER_HOUR:
        raise HTTPException(429, "Too many OTP requests for this number. Please try again later.")

    code = "".join(random.choices("0123456789", k=settings.OTP_LENGTH))
    otp = OTPRequest(phone=phone, purpose=payload.purpose, code_hash=hash_password(code),
                      expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES))
    db.add(otp)
    db.commit()

    message = f"Your UrbanGuard verification code is {code}. It expires in {settings.OTP_EXPIRE_MINUTES} minutes. Do not share this code."
    try:
        send_sms(phone, message)
    except SMSDeliveryError as e:
        # The OTP record still exists (useful for console-mode
        # dev/testing), but be honest that real delivery failed.
        raise HTTPException(502, f"Could not send SMS: {e}")

    return {
        "message": f"Verification code sent to {phone}.",
        "expires_in_minutes": settings.OTP_EXPIRE_MINUTES,
        "delivery_mode": settings.SMS_PROVIDER,
    }


@router.post("/otp/verify", response_model=OTPVerifyOut)
def verify_otp(payload: OTPVerifyIn, db: Session = Depends(get_db)):
    phone = payload.mobile.strip()
    otp = (db.query(OTPRequest)
           .filter(OTPRequest.phone == phone, OTPRequest.purpose == payload.purpose, OTPRequest.verified == False)  # noqa: E712
           .order_by(OTPRequest.created_at.desc()).first())
    if not otp:
        return OTPVerifyOut(verified=False, message="No pending verification code for this number. Request a new one.")
    if datetime.utcnow() > otp.expires_at:
        return OTPVerifyOut(verified=False, message="This code has expired. Request a new one.")
    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        return OTPVerifyOut(verified=False, message="Too many incorrect attempts. Request a new code.")

    if not verify_password(payload.code.strip(), otp.code_hash):
        otp.attempts += 1
        db.commit()
        remaining = settings.OTP_MAX_ATTEMPTS - otp.attempts
        return OTPVerifyOut(verified=False, message=f"Incorrect code. {remaining} attempt(s) remaining.")

    otp.verified = True
    otp.verified_at = datetime.utcnow()
    db.commit()

    ticket = create_short_lived_token({"phone": phone, "purpose": payload.purpose, "type": "otp_ticket"}, expires_minutes=30)
    return OTPVerifyOut(verified=True, otp_ticket=ticket, message="Mobile number verified.")


def _validate_otp_ticket(ticket: str, expected_phone: str, expected_purpose: str = "registration") -> bool:
    claims = decode_token(ticket)
    if not claims or claims.get("type") != "otp_ticket":
        return False
    return claims.get("phone") == expected_phone and claims.get("purpose") == expected_purpose


@router.post("/register/upload-document")
async def upload_registration_document(doc_type: str, file: UploadFile = File(...)):
    """Saves a document (government ID, driving licence, RC, insurance,
    PUC, fitness certificate) uploaded during registration, before an
    account exists. No auth is possible yet at this point in the flow --
    the returned URL is only useful when included in the final
    /register/citizen submission, and orphaned uploads that are never
    attached to an account are harmless (just an unused file)."""
    if file.content_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Use JPG, PNG, WEBP, or PDF.")
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File must be under 10MB")
    ext = ALLOWED_DOC_TYPES[file.content_type]
    filename = f"{doc_type.lower().replace(' ', '_')}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(REG_UPLOAD_DIR, filename)
    with open(dest, "wb") as f:
        f.write(contents)
    return {"url": f"/uploads/registration/{filename}", "doc_type": doc_type}


# ════════════════════════════════════════════════════════════════
# REGISTRATION -- identification -> OTP -> govt ID -> driving licence
# -> (optional) vehicle, submitted together as one payload.
# ════════════════════════════════════════════════════════════════
@router.post("/register/citizen", response_model=CitizenRegisterOut, status_code=201)
def register_citizen(payload: CitizenRegister, db: Session = Depends(get_db)):
    # Dedup checks -- specific, field-named errors so the citizen (and
    # the frontend) knows exactly what collided, not just "failed".
    if payload.email and db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(409, "This email address is already registered to another account.")
    if db.query(User).filter(User.mobile == payload.mobile).first():
        raise HTTPException(409, "This mobile number is already registered to another account.")
    if payload.govt_id_number and db.query(User).filter(User.govt_id_number == payload.govt_id_number).first():
        raise HTTPException(409, "This government ID number is already registered to another account.")

    reg_number = None
    if payload.vehicle_reg_number:
        reg_number = payload.vehicle_reg_number.strip().upper().replace(" ", "")
        if db.query(Vehicle).filter(Vehicle.reg_number == reg_number).first():
            raise HTTPException(409, "This vehicle registration number is already linked to another UrbanGuard account.")

    if settings.OTP_REQUIRED_FOR_REGISTRATION:
        if not payload.otp_ticket or not _validate_otp_ticket(payload.otp_ticket, payload.mobile):
            raise HTTPException(400, "Mobile number is not verified. Request and verify an OTP for this number first.")
    mobile_is_verified = bool(payload.otp_ticket and _validate_otp_ticket(payload.otp_ticket, payload.mobile))

    dob = None
    if payload.date_of_birth:
        try:
            dob = datetime.fromisoformat(payload.date_of_birth)
        except ValueError:
            raise HTTPException(400, "date_of_birth must be an ISO date, e.g. 1998-04-12")
    dl_expiry = None
    if payload.dl_expiry:
        try:
            dl_expiry = datetime.fromisoformat(payload.dl_expiry)
        except ValueError:
            raise HTTPException(400, "dl_expiry must be an ISO date, e.g. 2030-01-01")

    ug_id = generate_urbanguard_id(db, payload.state)
    temp_password = generate_temp_password()
    user = User(name=payload.name, email=payload.email, mobile=payload.mobile,
                date_of_birth=dob, gender=payload.gender, address=payload.address,
                state=payload.state, district=payload.district, pincode=payload.pincode,
                govt_id_number=payload.govt_id_number, govt_id_photo_url=payload.govt_id_photo_url,
                profile_photo_url=payload.profile_photo_url, mobile_verified=mobile_is_verified,
                family_member_count=payload.family_member_count, family_male_count=payload.family_male_count,
                family_female_count=payload.family_female_count, emergency_contact_name=payload.emergency_contact_name,
                emergency_contact_phone=payload.emergency_contact_phone,
                dl_number=payload.dl_number, dl_expiry=dl_expiry, dl_photo_url=payload.dl_photo_url,
                urbanguard_id=ug_id, hashed_password=hash_password(temp_password),
                role="Citizen", must_change_password=True)
    db.add(user)
    db.flush()  # get user.id before creating the vehicle

    if reg_number:
        vehicle = Vehicle(owner_id=user.id, reg_number=reg_number, vehicle_type=payload.vehicle_type,
                           manufacturer=payload.vehicle_manufacturer, model=payload.vehicle_model,
                           year=payload.vehicle_year, fuel_type=payload.vehicle_fuel_type,
                           color=payload.vehicle_color, engine_number=payload.vehicle_engine_number,
                           chassis_number=payload.vehicle_chassis_number)
        db.add(vehicle)
        db.flush()
        doc_map = [
            ("RC", payload.vehicle_rc_photo_url),
            ("Insurance", payload.vehicle_insurance_photo_url),
            ("PUC", payload.vehicle_puc_photo_url),
            ("Fitness", payload.vehicle_fitness_photo_url),
        ]
        for doc_type, url in doc_map:
            if url:
                db.add(VehicleDocument(vehicle_id=vehicle.id, doc_type=doc_type, file_url=url, status="Valid"))

    db.commit()
    return CitizenRegisterOut(urbanguard_id=ug_id, temporary_password=temp_password)


@router.post("/register", response_model=Token, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Legacy/dev registration (email + password) -- kept so existing
    accounts and the demo/testing flow keep working.

    SECURITY FIX: this used to create the account with whatever `role`
    the client sent in the request body (`role=payload.role`), so any
    unauthenticated caller could POST {"role": "admin"} and receive a
    valid admin JWT -- a complete bypass of every RBAC check in the app.
    This endpoint is public and has no legitimate reason to hand out a
    staff/admin role, so it now always creates a plain Citizen account
    regardless of what's submitted. Staff accounts (Traffic Police /
    Municipality / Emergency / admin) are only ever created via the demo
    seed data today -- there is currently no admin-only "create staff
    user" endpoint; add one (gated by require_role("admin")) if the
    platform needs to onboard staff through the API rather than seeding."""
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(409, "Email already registered")
    if len(payload.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user = User(name=payload.name, email=payload.email,
                hashed_password=hash_password(payload.password), role="Citizen")
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    ident = payload.identifier.strip()
    user = (db.query(User).filter(User.urbanguard_id == ident).first()
            or db.query(User).filter(User.username == ident).first()
            or db.query(User).filter(User.email == ident).first())
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    return _issue_token(user)


@router.post("/change-password", response_model=UserOut)
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(401, "Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    user.hashed_password = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user

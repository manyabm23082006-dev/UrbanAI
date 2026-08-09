import enum
from datetime import datetime
from sqlalchemy import (Column, Integer, String, Float, DateTime, Boolean,
                         ForeignKey, Text, Enum as SAEnum)
from sqlalchemy.orm import relationship
from ..core.database import Base


class RoleEnum(str, enum.Enum):
    admin = "admin"
    traffic_engineer = "Traffic Engineer"
    city_planner = "City Planner"
    analyst = "Analyst"
    emergency_manager = "Emergency Manager"
    emergency_operator = "Emergency Operator"  # Medical Emergency portal role (separate from Emergency Manager)
    citizen = "Citizen"


class PriorityEnum(str, enum.Enum):
    critical = "Critical"
    high = "High"
    medium = "Medium"
    low = "Low"
    monitoring = "Monitoring"


class StatusEnum(str, enum.Enum):
    submitted = "Submitted"
    under_analysis = "Under AI Analysis"
    verified = "Verified"
    accepted = "Accepted"
    assigned = "Assigned"
    in_progress = "Repair In Progress"
    inspection_pending = "Inspection Pending"
    completed = "Completed"
    closed = "Closed"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, index=True, nullable=True)
    username = Column(String(50), unique=True, index=True, nullable=True)   # Traffic Control / Super Admin portals
    urbanguard_id = Column(String(30), unique=True, index=True, nullable=True)  # Citizen portal (UG-2026-KA-000001)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default=RoleEnum.citizen.value)
    mobile = Column(String(20), nullable=True)
    date_of_birth = Column(DateTime, nullable=True)
    gender = Column(String(20), nullable=True)
    address = Column(String(300), nullable=True)
    state = Column(String(60), nullable=True)
    district = Column(String(60), nullable=True)
    pincode = Column(String(10), nullable=True)
    govt_id_number = Column(String(30), nullable=True, index=True)  # govt ID -- stored as-provided, NOT verified against any registry
    govt_id_photo_url = Column(String(500), nullable=True)
    profile_photo_url = Column(String(500), nullable=True)
    mobile_verified = Column(Boolean, default=False)  # set True only after a real OTP verification
    family_member_count = Column(Integer, nullable=True)
    family_male_count = Column(Integer, nullable=True)
    family_female_count = Column(Integer, nullable=True)
    emergency_contact_name = Column(String(120), nullable=True)
    emergency_contact_phone = Column(String(20), nullable=True)
    dl_number = Column(String(40), nullable=True)
    dl_expiry = Column(DateTime, nullable=True)
    dl_photo_url = Column(String(500), nullable=True)
    must_change_password = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    reports = relationship("Report", back_populates="reporter")


class TrafficRecord(Base):
    __tablename__ = "traffic_records"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True)
    location = Column(String(200))
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    speed = Column(Float)
    density = Column(Float)          # congestion %
    flow = Column(Integer)           # vehicles/hr
    congestion = Column(String(20))  # Free / Moderate / Heavy
    timestamp = Column(DateTime, default=datetime.utcnow)


class Sensor(Base):
    __tablename__ = "sensors"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True)
    location = Column(String(200))
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    kind = Column(String(50), default="traffic")  # traffic / weather / structural / parking
    speed = Column(Float, nullable=True)
    status = Column(String(20), default="active")  # active / warning / offline
    reading = Column(String(100), nullable=True)
    last_update = Column(DateTime, default=datetime.utcnow)


class Incident(Base):
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True)
    type = Column(String(80))         # Accident / Construction / Flooding / Stall / Event ...
    location = Column(String(200))
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    severity = Column(String(20))     # High / Medium / Low  (kept for backward compat w/ old UI)
    priority = Column(String(20), default=PriorityEnum.medium.value)
    delay_minutes = Column(Integer, default=0)
    status = Column(String(30), default=StatusEnum.submitted.value)
    reason = Column(Text, nullable=True)  # explainable-AI justification text
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reports = relationship("Report", back_populates="incident")


class Report(Base):
    """Citizen-submitted issue report -> can escalate into an Incident."""
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True)
    category = Column(String(80))    # Pothole / Streetlight / Drainage / Accident / etc.
    level = Column(String(20))       # Free Flow / Moderate / Heavy (traffic-condition reports)
    note = Column(Text, nullable=True)
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    status = Column(String(30), default=StatusEnum.submitted.value)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Healthcare/accident triage (Phase 11) -- only meaningful when category == "Accident"
    injuries_reported = Column(Boolean, nullable=True)
    ambulance_required = Column(Boolean, nullable=True)
    road_blocked = Column(Boolean, nullable=True)
    photo_url = Column(String(500), nullable=True)
    address_label = Column(String(300), nullable=True)  # reverse-geocoded address at time of report

    reporter = relationship("User", back_populates="reports")
    incident = relationship("Incident", back_populates="reports")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = broadcast/role-based
    audience_role = Column(String(50), nullable=True)
    title = Column(String(200))
    body = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════
# CITIZEN SMART MOBILITY — vehicles + digital documents
# ════════════════════════════════════════════════════════════════
class Vehicle(Base):
    __tablename__ = "vehicles"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reg_number = Column(String(30), unique=True, index=True)
    vehicle_type = Column(String(50))       # Car / Bike / Commercial / Auto
    manufacturer = Column(String(80), nullable=True)
    model = Column(String(80), nullable=True)
    year = Column(Integer, nullable=True)
    fuel_type = Column(String(30), nullable=True)
    color = Column(String(30), nullable=True)
    engine_number = Column(String(50), nullable=True)
    chassis_number = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User")
    documents = relationship("VehicleDocument", back_populates="vehicle", cascade="all, delete-orphan")
    violations = relationship("Violation", back_populates="vehicle")


class VehicleDocument(Base):
    __tablename__ = "vehicle_documents"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    doc_type = Column(String(30))   # RC / Insurance / PUC / Licence / Fitness
    doc_number = Column(String(80), nullable=True)
    issued_on = Column(DateTime, nullable=True)
    expires_on = Column(DateTime, nullable=True)
    status = Column(String(20), default="Valid")  # Valid / Expiring Soon / Expired
    last_notified_status = Column(String(20), nullable=True)  # dedup key so reminders don't repeat every check
    file_url = Column(String(500), nullable=True)  # path to the uploaded document image/PDF, if any

    vehicle = relationship("Vehicle", back_populates="documents")


# ════════════════════════════════════════════════════════════════
# TRAFFIC POLICE ENFORCEMENT — violations + e-challans
# ════════════════════════════════════════════════════════════════
class Violation(Base):
    __tablename__ = "violations"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    reg_number_text = Column(String(30), nullable=True)  # for lookups w/o a registered vehicle
    violation_type = Column(String(80))   # Helmet / Seatbelt / Wrong-way / Signal Jump / Parking / Speeding
    location = Column(String(200), nullable=True)
    confidence = Column(Float, default=0.9)
    officer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="violations")
    challan = relationship("Challan", back_populates="violation", uselist=False)


class Challan(Base):
    __tablename__ = "challans"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), nullable=False)
    amount = Column(Float, default=500.0)
    status = Column(String(20), default="Unpaid")  # Unpaid / Paid / Cancelled / Appealed
    issued_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)

    violation = relationship("Violation", back_populates="challan")


# ════════════════════════════════════════════════════════════════
# MUNICIPALITY / GOVERNMENT — city wards for aggregate scoring
# ════════════════════════════════════════════════════════════════
class Ward(Base):
    __tablename__ = "wards"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120))
    road_health = Column(Integer, default=80)
    bridge_health = Column(Integer, default=85)
    traffic_efficiency = Column(Integer, default=80)
    drainage_health = Column(Integer, default=80)
    streetlight_health = Column(Integer, default=85)
    budget_allocated = Column(Float, default=0)
    budget_used = Column(Float, default=0)


# ════════════════════════════════════════════════════════════════
# TRAFFIC CONTROL VISIBILITY (Phase 6) — live navigation sessions
# ════════════════════════════════════════════════════════════════
class LiveNavigation(Base):
    """A citizen's active navigation session, visible to Traffic Control
    while en route. Created when navigation starts, closed when it ends."""
    __tablename__ = "live_navigations"
    id = Column(Integer, primary_key=True, index=True)
    citizen_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    origin_label = Column(String(200), nullable=True)
    destination_label = Column(String(200), nullable=True)
    origin_lat = Column(Float, nullable=True)
    origin_lon = Column(Float, nullable=True)
    dest_lat = Column(Float, nullable=True)
    dest_lon = Column(Float, nullable=True)
    eta_minutes = Column(Integer, nullable=True)
    status = Column(String(20), default="Active")  # Active / Completed / Cancelled
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    citizen = relationship("User")


# ════════════════════════════════════════════════════════════════
# DATASET UPLOADS (Phase 13) — CSV/JSON traffic data ingestion
# ════════════════════════════════════════════════════════════════
class UploadedDataset(Base):
    __tablename__ = "uploaded_datasets"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(200))
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    row_count = Column(Integer, default=0)
    records_imported = Column(Integer, default=0)
    status = Column(String(20), default="Processed")  # Processed / Failed
    summary = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════
# INCIDENT AUDIT TRAIL — every status change, timestamped and attributed
# ════════════════════════════════════════════════════════════════
class IncidentEvent(Base):
    __tablename__ = "incident_events"
    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    status = Column(String(30))
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    department = Column(String(50), nullable=True)  # role of the actor at the time
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    changed_by = relationship("User")


# ════════════════════════════════════════════════════════════════
# OFFICER ACTIONS — vehicle inspection record, distinct from a challan
# ════════════════════════════════════════════════════════════════
class VehicleInspection(Base):
    __tablename__ = "vehicle_inspections"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    officer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    inspected_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════
# SMS OTP — mobile-number verification during registration. Codes
# are stored as a bcrypt hash, never plaintext, same as passwords.
# ════════════════════════════════════════════════════════════════
class OTPRequest(Base):
    __tablename__ = "otp_requests"
    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(20), index=True, nullable=False)
    purpose = Column(String(30), nullable=False)   # "registration" | "login" | "password_reset"
    code_hash = Column(String(255), nullable=False)
    attempts = Column(Integer, default=0)
    verified = Column(Boolean, default=False)
    verified_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════
# SAVED PLACES — a real "starred locations" feature (Google-Maps-adjacent)
# ════════════════════════════════════════════════════════════════
class SavedPlace(Base):
    __tablename__ = "saved_places"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    label = Column(String(120))
    address = Column(String(300), nullable=True)
    lat = Column(Float)
    lon = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════
# EMERGENCY CONTACTS — set during profile setup, notified on SOS
# ════════════════════════════════════════════════════════════════
class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(120))
    relationship_label = Column(String(60), nullable=True)  # avoid clashing with ORM's .relationship()
    mobile = Column(String(20))
    notify_on_emergency = Column(Boolean, default=True)


# ════════════════════════════════════════════════════════════════
# MEDICAL EMERGENCY MODULE — separate portal, full lifecycle tracking
# ════════════════════════════════════════════════════════════════
class ResponseUnit(Base):
    """A SIMULATED ambulance/response unit -- there is no real dispatch
    hardware or emergency-services API integration here. Clearly labeled
    as a demo/simulation."""
    __tablename__ = "response_units"
    id = Column(Integer, primary_key=True, index=True)
    call_sign = Column(String(30), unique=True)  # e.g. "Ambulance A12"
    status = Column(String(20), default="Available")  # Available / En Route / Busy / Offline
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)


class Emergency(Base):
    __tablename__ = "emergencies"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True)  # ER-UG-XXXXXX
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_witness = Column(Boolean, default=False)  # "I am witnessing this" vs. reporter is the patient
    emergency_type = Column(String(40))  # Road Accident / Medical Emergency / Person Injured / Other
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    address_label = Column(String(300), nullable=True)
    description = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)
    people_affected = Column(Integer, default=1)
    unconscious = Column(Boolean, default=False)
    bleeding = Column(Boolean, default=False)
    ambulance_required = Column(Boolean, default=False)
    road_blocked = Column(Boolean, default=False)

    priority = Column(String(20), default="Medium")  # Critical / High / Medium / Normal
    status = Column(String(30), default="New")

    assigned_unit_id = Column(Integer, ForeignKey("response_units.id"), nullable=True)
    eta_minutes = Column(Integer, nullable=True)
    recommended_route_index = Column(Integer, nullable=True)

    # Partial resolution tracking — five independently-tracked components, each 0-100.
    pct_response = Column(Integer, default=0)
    pct_traffic_control = Column(Integer, default=0)
    pct_team_arrived = Column(Integer, default=0)
    pct_patient_assistance = Column(Integer, default=0)
    pct_road_clearance = Column(Integer, default=0)

    infrastructure_flagged = Column(Boolean, default=False)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reporter = relationship("User")
    assigned_unit = relationship("ResponseUnit")


class EmergencyUpdate(Base):
    """Operator-authored progress notes + every status change, permanently logged."""
    __tablename__ = "emergency_updates"
    id = Column(Integer, primary_key=True, index=True)
    emergency_id = Column(Integer, ForeignKey("emergencies.id"), nullable=False)
    status = Column(String(30), nullable=True)
    note = Column(Text, nullable=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    operator = relationship("User")
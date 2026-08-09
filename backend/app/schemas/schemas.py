from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict


# ---------- Auth / Users ----------
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "Citizen"


class CitizenRegister(BaseModel):
    """Full citizen registration -- identification, OTP-verified mobile,
    government ID, driving licence, and (optionally) an initial vehicle,
    all submitted together as one flow."""
    name: str
    mobile: str
    email: Optional[EmailStr] = None
    date_of_birth: Optional[str] = None  # ISO date string, e.g. "1998-04-12"
    gender: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    pincode: Optional[str] = None
    govt_id_number: Optional[str] = None  # govt ID — stored as-provided, NOT verified against any registry
    govt_id_photo_url: Optional[str] = None
    profile_photo_url: Optional[str] = None
    family_member_count: Optional[int] = None
    family_male_count: Optional[int] = None
    family_female_count: Optional[int] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

    # Proof of OTP verification for `mobile` -- see /auth/otp/verify.
    # Required only when OTP_REQUIRED_FOR_REGISTRATION is enabled; if
    # provided regardless, the account is marked mobile_verified=True.
    otp_ticket: Optional[str] = None

    # Driving licence (optional at registration -- citizens without a
    # vehicle yet can skip this and add it later from their profile)
    dl_number: Optional[str] = None
    dl_expiry: Optional[str] = None
    dl_photo_url: Optional[str] = None

    # Initial vehicle (optional -- same rule as above)
    vehicle_reg_number: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_manufacturer: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_year: Optional[int] = None
    vehicle_fuel_type: Optional[str] = None
    vehicle_color: Optional[str] = None
    vehicle_engine_number: Optional[str] = None
    vehicle_chassis_number: Optional[str] = None
    vehicle_rc_photo_url: Optional[str] = None
    vehicle_insurance_photo_url: Optional[str] = None
    vehicle_puc_photo_url: Optional[str] = None
    vehicle_fitness_photo_url: Optional[str] = None


class AvailabilityCheck(BaseModel):
    email_taken: bool = False
    mobile_taken: bool = False
    govt_id_taken: bool = False
    vehicle_reg_taken: bool = False


class OTPRequestIn(BaseModel):
    mobile: str
    purpose: str = "registration"


class OTPVerifyIn(BaseModel):
    mobile: str
    purpose: str = "registration"
    code: str


class OTPVerifyOut(BaseModel):
    verified: bool
    otp_ticket: Optional[str] = None
    message: str


class CitizenRegisterOut(BaseModel):
    urbanguard_id: str
    temporary_password: str
    message: str = "Save these credentials — the temporary password is shown only once. You'll be required to change it on first login."


class LoginRequest(BaseModel):
    """Single login endpoint shared by all three portals — `identifier` is
    an UrbanGuard ID (Citizen), a username (Traffic Control / Super Admin),
    or an email (back-compat/admin convenience)."""
    identifier: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    urbanguard_id: Optional[str] = None
    role: str
    mobile: Optional[str] = None
    mobile_verified: bool = False
    state: Optional[str] = None
    district: Optional[str] = None
    must_change_password: bool = False
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Traffic ----------
class TrafficRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    location: str
    speed: float
    density: float
    flow: int
    congestion: str
    timestamp: datetime


class PredictRequest(BaseModel):
    distance_km: float
    hour: Optional[int] = None
    day_of_week: Optional[int] = None


class PredictResponse(BaseModel):
    congestion_pct: int
    speed_kmh: int
    eta_minutes: int
    delay_minutes: int
    confidence: float


class RouteRequest(BaseModel):
    from_lat: float
    from_lon: float
    to_lat: float
    to_lon: float


# ---------- Sensors ----------
class SensorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    location: str
    kind: str
    speed: Optional[float] = None
    status: str
    reading: Optional[str] = None
    last_update: datetime


# ---------- Incidents ----------
class IncidentCreate(BaseModel):
    type: str
    location: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    severity: Optional[str] = "Medium"
    delay_minutes: Optional[int] = 0


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    type: str
    location: str
    severity: str
    priority: str
    delay_minutes: int
    status: str
    reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IncidentStatusUpdate(BaseModel):
    status: str


# ---------- Reports ----------
class ReportCreate(BaseModel):
    category: str
    level: Optional[str] = None
    note: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    address_label: Optional[str] = None
    photo_url: Optional[str] = None
    # Healthcare/accident triage (Phase 11) — only relevant when category == "Accident"
    injuries_reported: Optional[bool] = None
    ambulance_required: Optional[bool] = None
    road_blocked: Optional[bool] = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    category: str
    level: Optional[str]
    note: Optional[str]
    status: str
    incident_id: Optional[int]
    created_at: datetime
    lat: Optional[float] = None
    lon: Optional[float] = None
    address_label: Optional[str] = None
    photo_url: Optional[str] = None
    injuries_reported: Optional[bool] = None
    ambulance_required: Optional[bool] = None
    road_blocked: Optional[bool] = None
    first_aid_guidance: Optional[str] = None
    recurrence_count: Optional[int] = None  # how many times this issue/location has been reported before


class ReportPublicOut(BaseModel):
    """Minimal, privacy-safe view of a report for unauthenticated/public
    consumers (map layers, recurrence checks). Deliberately excludes
    `note`, `photo_url`, and injury/ambulance/road-blocked flags, which
    can contain personal or sensitive details -- see ReportOut for the
    full record, only served to the reporter themself or staff roles."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    category: str
    level: Optional[str]
    status: str
    created_at: datetime
    lat: Optional[float] = None
    lon: Optional[float] = None
    address_label: Optional[str] = None


class PhotoUploadOut(BaseModel):
    url: str


# ---------- Chat ----------
class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    reply: str
    source: str  # "local" | "gemini"


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    body: str
    is_read: bool
    created_at: datetime


# ---------- Vehicles / Documents ----------
class VehicleCreate(BaseModel):
    reg_number: str
    vehicle_type: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    fuel_type: Optional[str] = None
    color: Optional[str] = None
    engine_number: Optional[str] = None
    chassis_number: Optional[str] = None


class VehicleDocumentCreate(BaseModel):
    doc_type: str
    doc_number: Optional[str] = None
    issued_on: Optional[datetime] = None
    expires_on: Optional[datetime] = None
    file_url: Optional[str] = None


class VehicleDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    doc_type: str
    doc_number: Optional[str]
    issued_on: Optional[datetime]
    expires_on: Optional[datetime]
    status: str
    file_url: Optional[str] = None


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reg_number: str
    vehicle_type: str
    manufacturer: Optional[str]
    model: Optional[str]
    year: Optional[int]
    fuel_type: Optional[str]
    color: Optional[str]
    engine_number: Optional[str] = None
    chassis_number: Optional[str] = None
    documents: List[VehicleDocumentOut] = []


# ---------- Enforcement ----------
class ViolationCreate(BaseModel):
    reg_number_text: str
    violation_type: str
    location: Optional[str] = None
    confidence: Optional[float] = 0.9


class ChallanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    amount: float
    status: str
    issued_at: datetime
    paid_at: Optional[datetime]


class ViolationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    reg_number_text: Optional[str]
    violation_type: str
    location: Optional[str]
    confidence: float
    created_at: datetime
    challan: Optional[ChallanOut] = None


class VehicleLookupOut(BaseModel):
    reg_number: str
    found: bool
    owner_name: Optional[str] = None
    vehicle_type: Optional[str] = None
    documents: List[VehicleDocumentOut] = []
    alerts: List[str] = []
    violations: List[ViolationOut] = []


# ---------- Municipality ----------
class BudgetForecastOut(BaseModel):
    expected_repairs: int
    estimated_budget_inr: float
    workers_required: int
    high_risk_roads: int
    critical_bridges: int


# ---------- Government / City health ----------
class WardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    road_health: int
    bridge_health: int
    traffic_efficiency: int
    drainage_health: int
    streetlight_health: int
    budget_allocated: float
    budget_used: float
    overall_score: int


class CityHealthOut(BaseModel):
    road_health: int
    bridge_health: int
    traffic_efficiency: int
    drainage_health: int
    streetlight_health: int
    infrastructure_health: int
    overall_score: int


# ---------- Live Navigation (Phase 6 — Traffic Control visibility) ----------
class LiveNavStart(BaseModel):
    origin_label: Optional[str] = None
    destination_label: Optional[str] = None
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    eta_minutes: Optional[int] = None
    vehicle_id: Optional[int] = None


class LiveNavOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    citizen_id: int
    citizen_name: Optional[str] = None
    origin_label: Optional[str]
    destination_label: Optional[str]
    eta_minutes: Optional[int]
    status: str
    started_at: datetime


# ---------- Dataset Upload (Phase 13) ----------
class DatasetUploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    row_count: int
    records_imported: int
    status: str
    summary: Optional[str]
    uploaded_at: datetime



# ---------- Saved Places ----------
class SavedPlaceCreate(BaseModel):
    label: str
    address: Optional[str] = None
    lat: float
    lon: float


class SavedPlaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    label: str
    address: Optional[str]
    lat: float
    lon: float
    created_at: datetime


# ---------- Emergency Contacts ----------
class EmergencyContactCreate(BaseModel):
    name: str
    relationship_label: Optional[str] = None
    mobile: str
    notify_on_emergency: bool = True


class EmergencyContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    relationship_label: Optional[str]
    mobile: str
    notify_on_emergency: bool


# ---------- Medical Emergency Module ----------
class EmergencyCreate(BaseModel):
    emergency_type: str  # Road Accident / Medical Emergency / Person Injured / Other
    is_witness: bool = False
    lat: Optional[float] = None
    lon: Optional[float] = None
    address_label: Optional[str] = None
    description: Optional[str] = None
    photo_url: Optional[str] = None
    people_affected: int = 1
    unconscious: bool = False
    bleeding: bool = False
    ambulance_required: bool = False
    road_blocked: bool = False


class EmergencyStatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None


class EmergencyAssign(BaseModel):
    unit_id: int
    eta_minutes: Optional[int] = None


class EmergencyResolutionUpdate(BaseModel):
    pct_response: Optional[int] = None
    pct_traffic_control: Optional[int] = None
    pct_team_arrived: Optional[int] = None
    pct_patient_assistance: Optional[int] = None
    pct_road_clearance: Optional[int] = None


class EmergencyUpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: Optional[str]
    note: Optional[str]
    operator_name: Optional[str] = None
    created_at: datetime


class ResponseUnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    call_sign: str
    status: str


class EmergencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    emergency_type: str
    is_witness: bool
    lat: Optional[float]
    lon: Optional[float]
    address_label: Optional[str]
    description: Optional[str]
    photo_url: Optional[str]
    people_affected: int
    unconscious: bool
    bleeding: bool
    ambulance_required: bool
    road_blocked: bool
    priority: str
    status: str
    assigned_unit_id: Optional[int]
    eta_minutes: Optional[int]
    pct_response: int
    pct_traffic_control: int
    pct_team_arrived: int
    pct_patient_assistance: int
    pct_road_clearance: int
    overall_pct: int = 0
    reporter_name: Optional[str] = None
    reporter_urbanguard_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmergencyCitizenOut(BaseModel):
    code: str
    emergency_type: str
    status: str
    overall_pct: int = 0
    created_at: datetime



# ---------- AI Smart Assistant (DB-aware queries) ----------
class SmartQueryResponse(BaseModel):
    reply: str
    data_source: str  # "database" | "local" | "gemini"


# ---------- Route Scoring (safest / fuel-efficient) ----------
class RouteScoreRequest(BaseModel):
    routes: List[List[List[float]]]  # each route: list of [lon, lat] coordinate pairs
    congestion_pcts: List[int]       # one per route, from the existing ML prediction


class RouteScoreOut(BaseModel):
    index: int
    safety_score: int
    fuel_score: int
    safety_reason: str
    fuel_reason: str


# ---------- Diversion Recommendation ----------
class DiversionRequest(BaseModel):
    incident_lat: float
    incident_lon: float
    routes: List[List[List[float]]]


class DiversionOut(BaseModel):
    recommended_index: int
    clearance_meters: List[float]  # min distance from incident to each route, in order
    reason: str


# ---------- IoT Sensor Ingestion ----------
class SensorIngest(BaseModel):
    code: str
    location: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    kind: Optional[str] = "traffic"
    speed: Optional[float] = None
    reading: Optional[str] = None
    status: Optional[str] = "active"


# ---------- Incident Audit Trail ----------
class IncidentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    department: Optional[str]
    remarks: Optional[str]
    changed_by_name: Optional[str] = None
    created_at: datetime


class IncidentStatusUpdateFull(BaseModel):
    status: str
    remarks: Optional[str] = None


# ---------- Officer Actions ----------
class InspectionCreate(BaseModel):
    notes: Optional[str] = None


class ControlRoomNotify(BaseModel):
    message: str
    reg_number: Optional[str] = None


# ---------- Analytics ----------
class PeakHourOut(BaseModel):
    hour: int
    avg_density: float
    record_count: int


class HotspotOut(BaseModel):
    location: str
    incident_count: int
    most_common_type: str


class AnalyticsOut(BaseModel):
    peak_hours: List[PeakHourOut]
    accident_hotspots: List[HotspotOut]
    active_users: int
    total_incidents: int
    avg_repair_hours: Optional[float] = None
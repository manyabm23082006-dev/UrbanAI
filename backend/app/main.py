import random
from datetime import datetime, timedelta
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse

from .core.config import settings
from .core.database import Base, engine, SessionLocal, ensure_schema_up_to_date
from .core.security import hash_password
from .models.models import User, TrafficRecord, Sensor, Incident, Vehicle, VehicleDocument, Violation, Challan, Ward, ResponseUnit

from .api.routes import auth, traffic, sensors, incidents, reports, chat, ws, vehicles, enforcement, municipality, government, notifications, datasets, livenav, places, emergency

app = FastAPI(title=settings.APP_NAME, version="1.0.0")
from pathlib import Path

# FIXED: point to backend/app/uploads
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(traffic.router)
app.include_router(sensors.router)
app.include_router(incidents.router)
app.include_router(reports.router)
app.include_router(chat.router)
app.include_router(ws.router)
app.include_router(vehicles.router)
app.include_router(enforcement.router)
app.include_router(municipality.router)
app.include_router(government.router)
app.include_router(notifications.router)
app.include_router(datasets.router)
app.include_router(livenav.router)
app.include_router(places.router)
app.include_router(emergency.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    """Any bug that would otherwise surface as a bare, unhelpful
    'Internal Server Error' now returns real JSON with the exception
    message, visible in the browser's Network tab -- makes bugs fixable
    in minutes instead of guessing games."""
    import traceback
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}


@app.get("/api/v1/emergency-numbers")
def emergency_numbers():
    """Real national emergency helpline numbers (India). Static reference
    data — not fetched from a live directory, but accurate as published."""
    return [
        {"label": "All-in-One Emergency", "number": "112"},
        {"label": "Police", "number": "100"},
        {"label": "Ambulance", "number": "108"},
        {"label": "Fire", "number": "101"},
        {"label": "Women's Helpline", "number": "1091"},
        {"label": "Child Helpline", "number": "1098"},
        {"label": "Disaster Management", "number": "1078"},
        {"label": "Road Accident Emergency (NHAI)", "number": "1033"},
        {"label": "Traffic Police (Bengaluru)", "number": "080-22943322"},
    ]


PLACES = ["Delhi NH-48", "Mumbai Sea Link", "Bengaluru ORR", "NYC Times Sq", "London M25",
          "Tokyo Expressway", "Paris Périphérique", "Dubai Sheikh Zayed", "Singapore ECP", "Sydney M1"]
SENSOR_LOCS = ["NH-8 Delhi", "Silk Board Blr", "Bandra Mumbai", "Times Sq NYC", "London Bridge",
               "Shibuya Tokyo", "Champs-Élysées", "Sheikh Zayed Rd", "Orchard Rd", "George St Sydney"]


def seed(db):
    if not db.query(User).first():
        # Super Admin Portal demo login (per SRS Phase 3)
        db.add(User(name="Admin User", email="admin@trafficai.pro", username="admin123",
                    hashed_password=hash_password("admin123"), role="admin"))
        # Traffic Control Room Portal demo login (per SRS Phase 3)
        db.add(User(name="Sarah Chen", email="sarah@city.gov", username="traffic123",
                    hashed_password=hash_password("traffic123"), role="Traffic Engineer"))
        # A seeded Citizen so the flagged-vehicles / vehicle demos still have data
        db.add(User(name="Demo Citizen", email="citizen@demo.com", mobile="9900000000",
                    urbanguard_id="UG-2026-KA-000001", state="Karnataka", district="Bengaluru Urban",
                    hashed_password=hash_password("demo1234"), role="Citizen"))
        # Municipality Portal demo login
        db.add(User(name="Ramesh Iyer", email="ramesh@municipality.gov", username="municipality123",
                    hashed_password=hash_password("municipality123"), role="City Planner"))
        # Medical Emergency Portal demo login
        db.add(User(name="Dr. Anjali Rao", email="anjali@emergency.gov", username="emergency123",
                    hashed_password=hash_password("emergency123"), role="Emergency Operator"))
        db.flush()

    if not db.query(TrafficRecord).first():
        for i, place in enumerate(PLACES * 2):
            cg = random.randint(15, 95)
            db.add(TrafficRecord(
                code=f"TRF-{i+1:05d}", location=place,
                speed=random.randint(15, 90), density=cg,
                flow=random.randint(400, 3600),
                congestion="Heavy" if cg > 65 else "Moderate" if cg > 35 else "Free",
                timestamp=datetime.utcnow() - timedelta(hours=i)))

    if not db.query(Sensor).first():
        for i, loc in enumerate(SENSOR_LOCS):
            db.add(Sensor(code=f"SNS-{i+1:03d}", location=loc,
                          speed=random.randint(20, 90),
                          status=random.choice(["active", "active", "active", "warning"]),
                          reading=f"{random.randint(400, 2400)} veh/hr"))

    if not db.query(Incident).first():
        for t, loc, sev, delay in [
            ("Accident", "Delhi NH-48", "High", 23),
            ("Construction", "Bengaluru ORR", "Medium", 12),
            ("Flooding", "Mumbai Western Exp", "High", 45),
            ("Stall", "Delhi Ring Rd", "Low", 5),
            ("Event", "Delhi CP", "Medium", 18),
        ]:
            db.add(Incident(code=f"INC-{random.randint(100000,999999)}", type=t, location=loc,
                            severity=sev, priority="High" if sev == "High" else "Medium",
                            delay_minutes=delay, reason=f'Seeded "{t}" incident for demo data.'))

    # --- Citizen vehicle + document demo data (one vehicle per citizen, per SRS Phase 1) ---
    if not db.query(Vehicle).first():
        demo_citizen = db.query(User).filter(User.urbanguard_id == "UG-2026-KA-000001").first()
        admin = db.query(User).filter(User.username == "admin123").first()
        v1 = Vehicle(owner_id=demo_citizen.id, reg_number="KA-01-AB-1234", vehicle_type="Car",
                     manufacturer="Maruti Suzuki", model="Swift", year=2021, fuel_type="Petrol", color="White")
        v2 = Vehicle(owner_id=admin.id, reg_number="KA-05-XY-9988", vehicle_type="Bike",
                     manufacturer="Royal Enfield", model="Classic 350", year=2022, fuel_type="Petrol", color="Black")
        db.add_all([v1, v2])
        db.flush()
        db.add_all([
            VehicleDocument(vehicle_id=v1.id, doc_type="RC", doc_number="RC-9981223",
                            issued_on=datetime.utcnow() - timedelta(days=900),
                            expires_on=datetime.utcnow() + timedelta(days=900), status="Valid"),
            VehicleDocument(vehicle_id=v1.id, doc_type="Insurance", doc_number="INS-2291884",
                            issued_on=datetime.utcnow() - timedelta(days=340),
                            expires_on=datetime.utcnow() + timedelta(days=20), status="Expiring Soon"),
            VehicleDocument(vehicle_id=v1.id, doc_type="PUC", doc_number="PUC-772341",
                            issued_on=datetime.utcnow() - timedelta(days=200),
                            expires_on=datetime.utcnow() - timedelta(days=5), status="Expired"),
            VehicleDocument(vehicle_id=v2.id, doc_type="RC", doc_number="RC-4471221",
                            issued_on=datetime.utcnow() - timedelta(days=500),
                            expires_on=datetime.utcnow() + timedelta(days=1200), status="Valid"),
        ])

    # --- Enforcement demo data ---
    if not db.query(Violation).first():
        admin = db.query(User).filter(User.email == "admin@trafficai.pro").first()
        veh = db.query(Vehicle).first()
        vi = Violation(code=f"VIO-{random.randint(100000,999999)}",
                       vehicle_id=veh.id if veh else None,
                       reg_number_text=veh.reg_number if veh else "KA-01-AB-1234",
                       violation_type="Signal Jump", location="MG Road Junction",
                       confidence=0.91, officer_id=admin.id)
        db.add(vi)
        db.flush()
        db.add(Challan(code=f"CHL-{random.randint(100000,999999)}", violation_id=vi.id, amount=1000))

    # --- City wards demo data (Government dashboard) ---
    if not db.query(Ward).first():
        for name, r, b, t, dr, sl in [
            ("Ward 1 - Central", 88, 91, 82, 79, 86),
            ("Ward 2 - North", 74, 80, 68, 65, 70),
            ("Ward 3 - East", 92, 95, 88, 90, 91),
            ("Ward 4 - South", 66, 70, 60, 58, 62),
        ]:
            db.add(Ward(name=name, road_health=r, bridge_health=b, traffic_efficiency=t,
                        drainage_health=dr, streetlight_health=sl,
                        budget_allocated=4_200_000, budget_used=2_600_000))

    # --- Simulated emergency response units (Medical Emergency portal demo data) ---
    if not db.query(ResponseUnit).first():
        for call_sign in ["Ambulance A12", "Ambulance A07", "Ambulance A19", "Rapid Response R1"]:
            db.add(ResponseUnit(call_sign=call_sign, status="Available"))

    db.commit()


@app.on_event("startup")
def on_startup():
    ensure_schema_up_to_date()  # add any columns missing from an older DB before we touch it
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


# Serve CSS and JS static directories explicitly
for folder_name in ["css", "js"]:
    folder_path = os.path.join(os.path.dirname(__file__), "..", folder_name)
    if not os.path.exists(folder_path):
        folder_path = folder_name
    if os.path.isdir(folder_path):
        app.mount(f"/{folder_name}", StaticFiles(directory=folder_path), name=folder_name)


# Root route fallback to serve index.html directly
@app.get("/")
async def serve_root():
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "..", "index.html"),
        "index.html",
        "/app/index.html",
        "/app/frontend/index.html"
    ]
    for path in possible_paths:
        if os.path.exists(path):
            return FileResponse(path)
    return {"detail": "FastAPI is running, but index.html was not found in container paths."}
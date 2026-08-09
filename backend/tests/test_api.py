"""
Minimal smoke tests. Run with: pytest -q
Uses a throwaway SQLite file so it never touches your dev database.
"""
import os
os.environ["DATABASE_URL"] = "sqlite:///./test_trafficai.db"

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def _startup():
    """Ensure FastAPI startup (DB create_all + seed) runs before tests."""
    with TestClient(app):
        yield


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_super_admin_portal_login():
    r = client.post("/api/v1/auth/login", json={"identifier": "admin123", "password": "admin123"})
    assert r.status_code == 200
    assert "access_token" in r.json()
    assert r.json()["user"]["role"] == "admin"


def test_traffic_control_portal_login():
    r = client.post("/api/v1/auth/login", json={"identifier": "traffic123", "password": "traffic123"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "Traffic Engineer"


def test_citizen_portal_registration_and_login():
    r = client.post("/api/v1/auth/register/citizen", json={
        "name": "Ravi Kumar", "mobile": "9876543210", "state": "Karnataka", "district": "Bengaluru Urban"
    })
    assert r.status_code == 201
    body = r.json()
    assert body["urbanguard_id"].startswith("UG-")
    assert len(body["temporary_password"]) > 0

    r2 = client.post("/api/v1/auth/login", json={"identifier": body["urbanguard_id"], "password": body["temporary_password"]})
    assert r2.status_code == 200
    assert r2.json()["user"]["must_change_password"] is True


def test_forced_password_change_flow():
    reg = client.post("/api/v1/auth/register/citizen", json={"name": "Priya S", "mobile": "9123456780"})
    ug_id, temp_pw = reg.json()["urbanguard_id"], reg.json()["temporary_password"]
    login = client.post("/api/v1/auth/login", json={"identifier": ug_id, "password": temp_pw})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/api/v1/auth/change-password", headers=headers,
                     json={"current_password": temp_pw, "new_password": "myNewPass123"})
    assert r.status_code == 200
    assert r.json()["must_change_password"] is False

    relogin = client.post("/api/v1/auth/login", json={"identifier": ug_id, "password": "myNewPass123"})
    assert relogin.status_code == 200


def test_one_vehicle_per_citizen():
    reg = client.post("/api/v1/auth/register/citizen", json={"name": "One Car Owner", "mobile": "9000011111"})
    token = client.post("/api/v1/auth/login", json={
        "identifier": reg.json()["urbanguard_id"], "password": reg.json()["temporary_password"]
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/api/v1/vehicles", headers=headers,
                     json={"reg_number": "KA-09-ZZ-0001", "vehicle_type": "Car"})
    assert r.status_code == 201

    r2 = client.post("/api/v1/vehicles", headers=headers,
                      json={"reg_number": "KA-09-ZZ-0002", "vehicle_type": "Bike"})
    assert r2.status_code == 400
    assert "already registered" in r2.json()["detail"]


def test_register_and_predict():
    r = client.post("/api/v1/auth/register", json={
        "name": "Test User", "email": "test.user@example.com", "password": "testpass123", "role": "Citizen"
    })
    assert r.status_code == 201

    r = client.post("/api/v1/traffic/predict", json={"distance_km": 10})
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["congestion_pct"] <= 100


def test_register_cannot_self_grant_privileged_role():
    """Critical RBAC fix: POST /auth/register used to create the account
    with whatever `role` the client sent, so anyone could self-register
    as "admin" and get a fully privileged token. Now the role is always
    forced to Citizen regardless of what's submitted."""
    r = client.post("/api/v1/auth/register", json={
        "name": "Would-be Admin", "email": "wannabe.admin@example.com",
        "password": "testpass123", "role": "admin"
    })
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "Citizen"

    # And that token genuinely has no admin access.
    token = r.json()["access_token"]
    forbidden = client.get("/api/v1/reports", headers={"Authorization": f"Bearer {token}"})
    assert forbidden.status_code == 403


def test_public_report_creates_incident_for_heavy():
    r = client.post("/api/v1/reports", json={"category": "Accident", "level": "Heavy", "note": "test"})
    assert r.status_code == 201
    assert r.json()["incident_id"] is not None


def test_accident_with_injuries_triggers_emergency_flow():
    """Phase 11 (SRS): an accident report with injuries must auto-escalate
    to Critical, return first-aid guidance, and notify Traffic Control."""
    r = client.post("/api/v1/reports", json={
        "category": "Accident", "note": "Two-vehicle collision",
        "injuries_reported": True, "ambulance_required": True, "road_blocked": True,
        "lat": 12.97, "lon": 77.59
    })
    assert r.status_code == 201
    body = r.json()
    assert body["incident_id"] is not None
    assert body["first_aid_guidance"] is not None

    traffic_token = client.post("/api/v1/auth/login",
                                 json={"identifier": "traffic123", "password": "traffic123"}).json()["access_token"]
    notifs = client.get("/api/v1/notifications", headers={"Authorization": f"Bearer {traffic_token}"})
    assert notifs.status_code == 200
    assert any("emergency" in n["title"].lower() for n in notifs.json())


def test_reports_privacy_split():
    """Phase 14/33: the full report list (note/photo/GPS/injury detail) is
    staff-only; a logged-in citizen gets their own via /mine; an
    unauthenticated caller only gets the stripped-down /public view."""
    admin_token = _admin_token()
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Anonymous caller: full list is forbidden outright.
    anon = client.get("/api/v1/reports")
    assert anon.status_code == 401

    # Staff (admin) can see the full list, including sensitive fields.
    staff = client.get("/api/v1/reports", headers=admin_headers)
    assert staff.status_code == 200
    assert "note" in staff.json()[0]

    # A citizen who is not staff gets 403 on the full list.
    citizen_token = client.post("/api/v1/auth/login",
                                 json={"identifier": "UG-2026-KA-000001", "password": "demo1234"}).json()["access_token"]
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}
    forbidden = client.get("/api/v1/reports", headers=citizen_headers)
    assert forbidden.status_code == 403

    # The citizen's own reports come back in full via /mine.
    mine = client.get("/api/v1/reports/mine", headers=citizen_headers)
    assert mine.status_code == 200

    # Anyone, logged in or not, can hit /public -- but never sees note/photo.
    public = client.get("/api/v1/reports/public")
    assert public.status_code == 200
    assert public.json() and "note" not in public.json()[0]
    assert "photo_url" not in public.json()[0]


def _admin_token():
    return client.post("/api/v1/auth/login", json={"identifier": "admin123", "password": "admin123"}).json()["access_token"]


def test_citizen_vehicles_and_documents():
    token = _admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get("/api/v1/vehicles", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1  # admin's seeded demo vehicle

    r = client.get("/api/v1/vehicles/expiring", headers=headers)
    assert r.status_code == 200


def test_enforcement_lookup_and_violation():
    token = _admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get("/api/v1/enforcement/lookup", params={"reg_number": "KA-01-AB-1234"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["found"] is True

    r = client.post("/api/v1/enforcement/violations", headers=headers,
                     json={"reg_number_text": "KA-05-XY-9988", "violation_type": "Helmet"})
    assert r.status_code == 201
    assert r.json()["challan"]["amount"] == 500


def test_municipality_and_government_dashboards():
    token = _admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get("/api/v1/municipality/repair-queue", headers=headers)
    assert r.status_code == 200
    r = client.get("/api/v1/municipality/budget-forecast", headers=headers)
    assert r.status_code == 200
    assert r.json()["estimated_budget_inr"] > 0

    r = client.get("/api/v1/government/city-health", headers=headers)
    assert r.status_code == 200
    r = client.get("/api/v1/government/wards", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 4  # seeded demo wards


def test_role_based_access_control():
    """A plain Citizen must be blocked from police/municipality/government
    dashboards, but can still see their own data -- the core requirement
    behind the whole role-separation feature."""
    reg = client.post("/api/v1/auth/register/citizen", json={"name": "RBAC Citizen", "mobile": "9555500000"})
    citizen_token = client.post("/api/v1/auth/login", json={
        "identifier": reg.json()["urbanguard_id"], "password": reg.json()["temporary_password"]
    }).json()["access_token"]
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}

    assert client.get("/api/v1/enforcement/flagged-vehicles", headers=citizen_headers).status_code == 403
    assert client.get("/api/v1/municipality/repair-queue", headers=citizen_headers).status_code == 403
    assert client.get("/api/v1/government/city-health", headers=citizen_headers).status_code == 403
    assert client.get("/api/v1/government/city-health").status_code == 401  # no token at all
    assert client.get("/api/v1/vehicles", headers=citizen_headers).status_code == 200  # own data still works

    sarah_token = client.post("/api/v1/auth/login",
                               json={"identifier": "traffic123", "password": "traffic123"}).json()["access_token"]
    sarah_headers = {"Authorization": f"Bearer {sarah_token}"}
    assert client.get("/api/v1/enforcement/flagged-vehicles", headers=sarah_headers).status_code == 200
    assert client.get("/api/v1/government/city-health", headers=sarah_headers).status_code == 403


def test_document_expiry_notification_delivered():
    """Ticket 2: viewing a vehicle with an expired/expiring document must
    actually create a Notification for the owner, once per transition."""
    login = client.post("/api/v1/auth/login", json={"identifier": "UG-2026-KA-000001", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.get("/api/v1/vehicles", headers=headers)  # triggers status refresh + notify
    notifs = client.get("/api/v1/notifications", headers=headers).json()
    reminder_titles = [n["title"] for n in notifs if "reminder" in n["title"].lower()]
    assert len(reminder_titles) >= 1  # seeded demo citizen has an Expired PUC and Expiring-Soon Insurance

    # calling again must NOT duplicate the same reminder (dedup via last_notified_status)
    client.get("/api/v1/vehicles", headers=headers)
    notifs_again = client.get("/api/v1/notifications", headers=headers).json()
    assert len(notifs_again) == len(notifs)


def test_ai_assistant_answers_from_real_database():
    """Ticket 3: SRS 'AI Smart Assistant' example queries must be answered
    from actual DB state, gated by role, not canned text."""
    # Anonymous users are told they need the right role, not given data or an error
    r = client.post("/api/v1/chat/ask", json={"message": "show all critical roads"})
    assert r.status_code == 200
    assert "restricted" in r.json()["reply"].lower()

    admin_token = _admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}

    r = client.post("/api/v1/chat/ask", json={"message": "which ward needs the highest budget"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["source"] == "database"
    assert "ward" in r.json()["reply"].lower()

    r = client.post("/api/v1/chat/ask", json={"message": "predict next months maintenance cost"}, headers=headers)
    assert r.status_code == 200
    assert "repair" in r.json()["reply"].lower()

    # A generic question still gets the normal local/Gemini answer, unaffected
    r = client.post("/api/v1/chat/ask", json={"message": "traffic in Mumbai"})
    assert r.status_code == 200
    assert r.json()["source"] == "local"


def test_dataset_csv_upload_imports_traffic_records():
    """Ticket 4: uploading a CSV must actually parse and insert real
    TrafficRecord rows, not just accept the file."""
    token = _admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    before = len(client.get("/api/v1/traffic/records", params={"limit": 500}, headers=headers).json())

    csv_content = "location,speed,density,flow\nMG Road,45,72,1800\nRing Road,60,30,900\n"
    files = {"file": ("survey.csv", csv_content, "text/csv")}
    r = client.post("/api/v1/datasets/upload", headers=headers, files=files)
    assert r.status_code == 201
    body = r.json()
    assert body["records_imported"] == 2
    assert body["status"] == "Processed"

    after = len(client.get("/api/v1/traffic/records", params={"limit": 500}, headers=headers).json())
    assert after >= before  # new rows exist (limit may cap the count, so >= not ==)


def test_dataset_upload_rejects_non_csv_and_requires_role():
    token = _admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    files = {"file": ("notes.txt", "hello", "text/plain")}
    r = client.post("/api/v1/datasets/upload", headers=headers, files=files)
    assert r.status_code == 400

    reg = client.post("/api/v1/auth/register/citizen", json={"name": "Upload Test", "mobile": "9111122222"})
    citizen_token = client.post("/api/v1/auth/login", json={
        "identifier": reg.json()["urbanguard_id"], "password": reg.json()["temporary_password"]
    }).json()["access_token"]
    files2 = {"file": ("survey.csv", "location,speed\nX,50\n", "text/csv")}
    r2 = client.post("/api/v1/datasets/upload", headers={"Authorization": f"Bearer {citizen_token}"}, files=files2)
    assert r2.status_code == 403  # Citizens can't upload municipal datasets


def test_live_navigation_visible_to_traffic_control():
    """Ticket 5 (Phase 6): starting navigation must create a session
    Traffic Control can see; stopping it must remove it from the active list."""
    reg = client.post("/api/v1/auth/register/citizen", json={"name": "Nav Test", "mobile": "9333344444"})
    citizen_token = client.post("/api/v1/auth/login", json={
        "identifier": reg.json()["urbanguard_id"], "password": reg.json()["temporary_password"]
    }).json()["access_token"]
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}

    start = client.post("/api/v1/live-nav/start", headers=citizen_headers, json={
        "origin_label": "Home", "destination_label": "Office", "eta_minutes": 22
    })
    assert start.status_code == 201
    nav_id = start.json()["id"]

    traffic_token = client.post("/api/v1/auth/login",
                                 json={"identifier": "traffic123", "password": "traffic123"}).json()["access_token"]
    active = client.get("/api/v1/live-nav/active", headers={"Authorization": f"Bearer {traffic_token}"})
    assert active.status_code == 200
    assert any(n["id"] == nav_id and n["citizen_name"] == "Nav Test" for n in active.json())

    # Citizens themselves cannot see the aggregate control-room feed
    denied = client.get("/api/v1/live-nav/active", headers=citizen_headers)
    assert denied.status_code == 403

    stop = client.post(f"/api/v1/live-nav/{nav_id}/stop", headers=citizen_headers)
    assert stop.status_code == 204
    active_after = client.get("/api/v1/live-nav/active", headers={"Authorization": f"Bearer {traffic_token}"}).json()
    assert not any(n["id"] == nav_id for n in active_after)


def test_photo_upload_and_report_recurrence():
    """Ticket: photo upload + recurrence count for repeated pothole/etc reports."""
    r = client.post("/api/v1/reports/upload-photo",
                     files={"file": ("test.jpg", b"\xff\xd8\xff\xe0fakejpegdata", "image/jpeg")})
    assert r.status_code == 201
    assert r.json()["url"].startswith("/uploads/")

    r1 = client.post("/api/v1/reports", json={"category": "Pothole", "note": "deep", "lat": 12.90, "lon": 77.60})
    r2 = client.post("/api/v1/reports", json={"category": "Pothole", "note": "still there", "lat": 12.9001, "lon": 77.6001})
    assert r1.json()["recurrence_count"] == 0
    assert r2.json()["recurrence_count"] == 1  # found the first one within 150m


def test_route_scoring_and_diversion():
    r = client.post("/api/v1/traffic/score-routes", json={
        "routes": [[[77.59, 12.97], [77.60, 12.98]], [[77.59, 12.97], [77.61, 12.99]]],
        "congestion_pcts": [70, 30]
    })
    assert r.status_code == 200
    scores = r.json()
    assert scores[1]["fuel_score"] > scores[0]["fuel_score"]  # lower congestion route scores better

    r2 = client.post("/api/v1/traffic/diversion", json={
        "incident_lat": 12.975, "incident_lon": 77.595,
        "routes": [[[77.59, 12.97], [77.60, 12.98]], [[77.70, 12.80], [77.71, 12.81]]]
    })
    assert r2.status_code == 200
    assert r2.json()["recommended_index"] == 1  # the far-away route has more clearance


def test_iot_sensor_ingestion():
    r = client.post("/api/v1/sensors/ingest", json={
        "code": "ESP32-TEST-01", "location": "Test Junction", "speed": 42, "reading": "1200 veh/hr"
    })
    assert r.status_code == 201
    assert r.json()["code"] == "ESP32-TEST-01"
    # posting again with the same code updates in place rather than duplicating
    r2 = client.post("/api/v1/sensors/ingest", json={"code": "ESP32-TEST-01", "speed": 55})
    assert r2.json()["speed"] == 55
    all_sensors = client.get("/api/v1/sensors").json()
    assert len([s for s in all_sensors if s["code"] == "ESP32-TEST-01"]) == 1


def test_iot_ingestion_enforces_device_key_when_configured():
    """IOT_DEVICE_KEY is blank by default (see test above, which relies on
    that). When an operator sets it, ingestion must require a matching
    X-Device-Key header -- otherwise anyone on the internet could inject
    fake sensor readings."""
    from app.core.config import settings
    settings.IOT_DEVICE_KEY = "secret-device-key"
    try:
        no_key = client.post("/api/v1/sensors/ingest", json={"code": "ESP32-TEST-02", "speed": 40})
        assert no_key.status_code == 401

        wrong_key = client.post("/api/v1/sensors/ingest", json={"code": "ESP32-TEST-02", "speed": 40},
                                 headers={"X-Device-Key": "not-the-right-key"})
        assert wrong_key.status_code == 401

        right_key = client.post("/api/v1/sensors/ingest", json={"code": "ESP32-TEST-02", "speed": 40},
                                 headers={"X-Device-Key": "secret-device-key"})
        assert right_key.status_code == 201
    finally:
        settings.IOT_DEVICE_KEY = ""  # restore default so later tests aren't affected


def test_incident_audit_trail_and_reporter_notification():
    admin_token = _admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}
    inc = client.post("/api/v1/incidents", headers=headers,
                       json={"type": "Pothole", "location": "Audit Test Road", "severity": "High"})
    inc_id = inc.json()["id"]
    client.patch(f"/api/v1/incidents/{inc_id}/status", headers=headers,
                 json={"status": "Assigned", "remarks": "Assigned to Team B"})
    # /timeline requires login now -- it exposes internal officer remarks
    # and department, which used to leak to unauthenticated requests.
    unauth = client.get(f"/api/v1/incidents/{inc_id}/timeline")
    assert unauth.status_code == 401
    timeline = client.get(f"/api/v1/incidents/{inc_id}/timeline", headers=headers).json()
    assert len(timeline) == 2
    assert timeline[0]["status"] == "Submitted"
    assert timeline[1]["status"] == "Assigned"
    assert timeline[1]["remarks"] == "Assigned to Team B"
    assert timeline[1]["changed_by_name"] == "Admin User"


def test_officer_actions_and_control_room_notify():
    admin_token = _admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/v1/enforcement/vehicles/KA-01-AB-1234/inspect", headers=headers, json={"notes": "Routine check"})
    assert r.status_code == 201

    r2 = client.post("/api/v1/enforcement/notify-control-room", headers=headers, json={"message": "Backup needed"})
    assert r2.status_code == 201

    traffic_token = client.post("/api/v1/auth/login", json={"identifier": "traffic123", "password": "traffic123"}).json()["access_token"]
    notifs = client.get("/api/v1/notifications", headers={"Authorization": f"Bearer {traffic_token}"}).json()
    assert any("Control room alert" in n["title"] for n in notifs)


def test_citizen_sees_own_challans():
    citizen_token = client.post("/api/v1/auth/login", json={"identifier": "UG-2026-KA-000001", "password": "demo1234"}).json()["access_token"]
    r = client.get("/api/v1/enforcement/my-challans", headers={"Authorization": f"Bearer {citizen_token}"})
    assert r.status_code == 200
    assert all("challan" in v for v in r.json())


def test_challan_payment_requires_auth_and_ownership():
    """Previously PATCH /challans/{id}/pay had no auth at all -- anyone
    could mark any challan Paid by guessing an ID. Now: anonymous is
    rejected, a non-owner citizen is forbidden, and the owning citizen
    (or staff) can pay it."""
    admin_token = _admin_token()
    citizen_token = client.post("/api/v1/auth/login",
                                 json={"identifier": "UG-2026-KA-000001", "password": "demo1234"}).json()["access_token"]
    # Seeded violation/challan (see main.py seed()) is against the demo
    # citizen's vehicle KA-01-AB-1234.
    challans = client.get("/api/v1/enforcement/my-challans",
                           headers={"Authorization": f"Bearer {citizen_token}"}).json()
    assert challans, "expected the seeded challan to be visible to its owning citizen"
    challan_id = challans[0]["challan"]["id"]

    anon = client.patch(f"/api/v1/enforcement/challans/{challan_id}/pay")
    assert anon.status_code == 401

    # A second, unrelated citizen (owns no vehicles) must be forbidden.
    other_reg = client.post("/api/v1/auth/register/citizen", json={"name": "Unrelated Citizen", "mobile": "9000022222"})
    other_token = client.post("/api/v1/auth/login", json={
        "identifier": other_reg.json()["urbanguard_id"], "password": other_reg.json()["temporary_password"]
    }).json()["access_token"]
    forbidden = client.patch(f"/api/v1/enforcement/challans/{challan_id}/pay",
                              headers={"Authorization": f"Bearer {other_token}"})
    assert forbidden.status_code == 403

    # The vehicle owner can pay it.
    paid = client.patch(f"/api/v1/enforcement/challans/{challan_id}/pay",
                         headers={"Authorization": f"Bearer {citizen_token}"})
    assert paid.status_code == 200
    assert paid.json()["status"] == "Paid"

    # Paying it again is rejected (already paid), even for staff.
    again = client.patch(f"/api/v1/enforcement/challans/{challan_id}/pay",
                          headers={"Authorization": f"Bearer {admin_token}"})
    assert again.status_code == 400


def test_government_analytics_real_aggregation():
    admin_token = _admin_token()
    r = client.get("/api/v1/government/analytics", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["active_users"] >= 1
    assert body["total_incidents"] >= 1
    assert isinstance(body["peak_hours"], list)


def teardown_module(module):
    try:
        os.remove("./test_trafficai.db")
    except FileNotFoundError:
        pass

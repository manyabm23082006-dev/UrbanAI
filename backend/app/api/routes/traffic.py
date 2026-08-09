from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
import httpx, random

from ...core.database import get_db
from ...models.models import Incident, TrafficRecord
from ...schemas.schemas import TrafficRecordOut, PredictRequest, PredictResponse, RouteRequest
from ...services.ml_engine import predict as ml_predict, forecast as ml_forecast
from ...services.route_scoring import score_route
from ...services.diversion_engine import recommend_diversion
from ...schemas.schemas import RouteScoreRequest, RouteScoreOut, DiversionRequest, DiversionOut

router = APIRouter(prefix="/api/v1/traffic", tags=["traffic"])


@router.get("/records", response_model=list[TrafficRecordOut])
def list_records(limit: int = 20, db: Session = Depends(get_db)):
    return db.query(TrafficRecord).order_by(desc(TrafficRecord.timestamp)).limit(limit).all()


@router.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest):
    p = ml_predict(payload.distance_km, payload.hour, payload.day_of_week)
    return PredictResponse(**p)


@router.get("/forecast")
def forecast(current_congestion: int = 50):
    return ml_forecast(current_congestion)


@router.post("/route")
async def route(payload: RouteRequest):
    """Server-side proxy to OSRM so the API key / rate limiting / caching
    all live in one place instead of the browser calling third parties directly."""
    url = (f"https://router.project-osrm.org/route/v1/driving/"
           f"{payload.from_lon},{payload.from_lat};{payload.to_lon},{payload.to_lat}"
           f"?overview=full&geometries=geojson&alternatives=true&steps=true")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        raise HTTPException(502, f"Routing provider unavailable: {e}")


@router.get("/geocode")
async def geocode(q: str, limit: int = 8):
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&addressdetails=1&limit={limit}"
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "TrafficAIPro/1.0"}) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        raise HTTPException(502, f"Geocoding provider unavailable: {e}")


@router.get("/reverse-geocode")
async def reverse_geocode(lat: float, lon: float):
    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "TrafficAIPro/1.0"}) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        raise HTTPException(502, f"Reverse geocoding provider unavailable: {e}")


@router.post("/score-routes", response_model=list[RouteScoreOut])
def score_routes(payload: RouteScoreRequest, db: Session = Depends(get_db)):
    """Real safety/fuel scoring per route alternative, using open incident
    locations from the database — see services/route_scoring.py for the
    exact formula."""
    if len(payload.routes) != len(payload.congestion_pcts):
        raise HTTPException(400, "routes and congestion_pcts must be the same length")
    incidents = db.query(Incident).filter(Incident.status != "Closed",
                                           Incident.lat.isnot(None), Incident.lon.isnot(None)).all()
    incident_points = [(i.lat, i.lon) for i in incidents]
    out = []
    for idx, (coords, cg) in enumerate(zip(payload.routes, payload.congestion_pcts)):
        s = score_route(coords, cg, incident_points)
        out.append(RouteScoreOut(index=idx, **s))
    return out


@router.post("/diversion", response_model=DiversionOut)
def diversion(payload: DiversionRequest):
    """Real geometric clearance computation — see services/diversion_engine.py."""
    if not payload.routes:
        raise HTTPException(400, "At least one route is required")
    result = recommend_diversion(payload.incident_lat, payload.incident_lon, payload.routes)
    return DiversionOut(**result)

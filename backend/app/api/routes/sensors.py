from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...core.config import settings
from ...models.models import Sensor
from ...schemas.schemas import SensorOut, SensorIngest

router = APIRouter(prefix="/api/v1/sensors", tags=["sensors"])


@router.get("", response_model=list[SensorOut])
def list_sensors(db: Session = Depends(get_db)):
    return db.query(Sensor).all()


@router.post("/ingest", response_model=SensorOut, status_code=201)
def ingest_reading(payload: SensorIngest, db: Session = Depends(get_db),
                    x_device_key: str = Header(default=None)):
    """
    Phase 13 IoT ingestion — a real endpoint a physical device (ESP32,
    Arduino, or any HTTP-capable sensor gateway) can POST readings to.
    Upserts by sensor `code` so repeated pushes from the same device just
    update its latest reading rather than creating duplicates.

    No hardware exists in this environment to call this automatically --
    but the endpoint is genuinely functional and this is exactly the
    shape a device integration would use.

    Gated by IOT_DEVICE_KEY (see core/config.py): if set, every ingest
    call must present a matching X-Device-Key header, so this can't be
    used to inject fake readings from the open internet. Blank by default
    for zero-config local demo use.
    """
    if settings.IOT_DEVICE_KEY and x_device_key != settings.IOT_DEVICE_KEY:
        raise HTTPException(401, "Missing or invalid X-Device-Key header")

    sensor = db.query(Sensor).filter(Sensor.code == payload.code).first()
    if not sensor:
        # New device registering for the first time: give it a
        # placeholder location rather than leaving it NULL, since
        # SensorOut (and every dashboard/map that renders sensors)
        # expects a non-null string.
        sensor = Sensor(code=payload.code, location=payload.location or "Unassigned")
        db.add(sensor)
    sensor.location = payload.location or sensor.location
    sensor.lat = payload.lat if payload.lat is not None else sensor.lat
    sensor.lon = payload.lon if payload.lon is not None else sensor.lon
    sensor.kind = payload.kind or sensor.kind
    sensor.speed = payload.speed if payload.speed is not None else sensor.speed
    sensor.reading = payload.reading or sensor.reading
    sensor.status = payload.status or sensor.status
    sensor.last_update = datetime.utcnow()
    db.commit()
    db.refresh(sensor)
    return sensor

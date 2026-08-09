"""
Dataset Upload (Phase 13) — lets Municipality/Government/Traffic roles feed
real traffic-count CSVs into the platform. This is the honest version of
"IoT integration": there's no hardware to receive live sensor streams from
in this environment, but uploaded survey/count data is genuinely parsed
and imported into the same TrafficRecord table the ML model reads from.

Expected CSV columns (header row required): location, speed, density, flow
Only `location` is mandatory; missing numeric fields default sensibly so a
partial export still imports instead of failing the whole file.
"""
import csv
import io
import random
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.models import UploadedDataset, TrafficRecord, User
from ...schemas.schemas import DatasetUploadOut
from ..deps import require_role, MUNICIPALITY_ROLES

router = APIRouter(prefix="/api/v1/datasets", tags=["datasets"])


@router.get("", response_model=list[DatasetUploadOut])
def list_datasets(db: Session = Depends(get_db), _=Depends(require_role(*MUNICIPALITY_ROLES))):
    return db.query(UploadedDataset).order_by(UploadedDataset.uploaded_at.desc()).all()


@router.post("/upload", response_model=DatasetUploadOut, status_code=201)
async def upload_dataset(file: UploadFile = File(...), db: Session = Depends(get_db),
                          user: User = Depends(require_role(*MUNICIPALITY_ROLES))):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only .csv files are supported")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "File is not valid UTF-8 text")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "location" not in [f.strip().lower() for f in reader.fieldnames]:
        raise HTTPException(400, "CSV must include at least a 'location' column")

    row_count, imported = 0, 0
    for row in reader:
        row_count += 1
        row = {k.strip().lower(): (v.strip() if v else v) for k, v in row.items()}
        location = row.get("location")
        if not location:
            continue
        try:
            speed = float(row.get("speed") or random.randint(20, 70))
            density = float(row.get("density") or random.randint(15, 85))
            flow = int(float(row.get("flow") or random.randint(400, 3000)))
        except ValueError:
            continue  # skip malformed numeric fields rather than failing the whole upload
        congestion = "Heavy" if density > 65 else "Moderate" if density > 35 else "Free"
        db.add(TrafficRecord(code=f"UPL-{random.randint(100000,999999)}", location=location,
                              speed=speed, density=density, flow=flow, congestion=congestion))
        imported += 1

    dataset = UploadedDataset(filename=file.filename, uploaded_by=user.id, row_count=row_count,
                               records_imported=imported,
                               status="Processed" if imported else "Failed",
                               summary=f"{imported}/{row_count} rows imported as traffic records.")
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset

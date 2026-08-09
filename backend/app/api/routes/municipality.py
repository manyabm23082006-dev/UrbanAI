"""Municipality dashboard: AI repair priority queue + predictive budget planning."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.models import Incident
from ...schemas.schemas import IncidentOut, BudgetForecastOut
from ...services.budget_engine import forecast as budget_forecast
from ..deps import require_role, MUNICIPALITY_ROLES

router = APIRouter(prefix="/api/v1/municipality", tags=["municipality"])

PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Monitoring": 4}


@router.get("/repair-queue", response_model=list[IncidentOut])
def repair_queue(db: Session = Depends(get_db), _=Depends(require_role(*MUNICIPALITY_ROLES))):
    """Open incidents sorted by AI-assigned priority — the municipality's work queue."""
    incidents = db.query(Incident).filter(Incident.status != "Closed").all()
    incidents.sort(key=lambda i: PRIORITY_ORDER.get(i.priority, 9))
    return incidents


@router.get("/budget-forecast", response_model=BudgetForecastOut)
def budget_forecast_endpoint(db: Session = Depends(get_db), _=Depends(require_role(*MUNICIPALITY_ROLES))):
    open_incidents = db.query(Incident).filter(Incident.status != "Closed").all()
    high_priority = [i for i in open_incidents if i.priority in ("Critical", "High")]
    critical_bridges = len([i for i in open_incidents if "bridge" in (i.type or "").lower() and i.priority == "Critical"])
    return budget_forecast(open_incidents, len(high_priority), critical_bridges)

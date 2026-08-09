"""
AI assistant: tries a database-aware answer first for the specific
analytical questions the SRS calls out ("show all critical roads",
"which ward needs the highest budget", etc.), then Gemini (if configured),
then a fully local rule-based expert -- local-first / cloud-last-resort,
same pattern used elsewhere, extended with a genuine data-query layer
instead of only canned text.
"""
import httpx
from sqlalchemy.orm import Session
from ..core.config import settings

QUICK_FACTS = {
    "delhi": "Delhi: ~33M people, 12M+ vehicles. Worst spots: ITO junction, Dhaula Kuan. Peak hours 8-10:30 AM & 5:30-8:30 PM.",
    "bengaluru": "Bengaluru: ~14M people. Worst spots: Silk Board Junction, ORR, KR Puram. Peak 8:30-11 AM & 6-9 PM (India's worst).",
    "bangalore": "Bengaluru: ~14M people. Worst spots: Silk Board Junction, ORR, KR Puram. Peak 8:30-11 AM & 6-9 PM (India's worst).",
    "mumbai": "Mumbai: ~21M people, 7.5M daily local-train riders. Worst spots: Bandra-Worli approach, Western Express Hwy. Peak 7:30-10 AM & 5:30-9 PM.",
}


def local_answer(msg: str, context: dict | None = None) -> str:
    q = msg.lower()
    for city, fact in QUICK_FACTS.items():
        if city in q:
            return fact
    if "ml" in q or "lstm" in q or "random forest" in q or "machine learning" in q:
        return ("Our traffic model blends an LSTM (time-series patterns) with a Random Forest "
                "(weather/day/event features). The ensemble output drives congestion %, speed, "
                "and ETA predictions, retrained weekly on incoming records.")
    if "weather" in q or "rain" in q:
        return ("Rain typically cuts speed 10-25% and road capacity ~15%; the model adds roughly "
                "+15% to predicted travel time when rain is detected for the route's area.")
    if context and ("route" in q or "best" in q or "traffic" in q):
        return "Based on the current route data, I'd recommend the lowest-congestion option shown in the Routes panel."
    return ("I'm the UrbanGuard AI assistant. Ask me about a city's traffic patterns, how the ML "
            "model works, weather impact, your current route, or (if you're signed in with the "
            "right role) analytical questions like 'show critical roads' or 'which ward needs the "
            "highest budget'.")


def try_db_answer(msg: str, db: Session, user) -> str | None:
    """Matches a handful of specific analytical intents from the SRS
    ("AI Smart Assistant" examples) against the real database, gated by
    the same role rules as the dashboards the data comes from. Returns
    None if nothing matched, so the caller falls through to Gemini/local."""
    from ..models.models import Incident, Ward
    from ..api.deps import GOVERNMENT_ROLES, MUNICIPALITY_ROLES
    from ..services.budget_engine import forecast as budget_forecast
    from ..services.city_health import ward_score

    q = msg.lower()
    role = user.role if user else None

    if "critical" in q and ("road" in q or "incident" in q):
        if not (user and role in MUNICIPALITY_ROLES):
            return "Critical-incident data is restricted to Municipality/Traffic/Government roles — sign in with one of those to ask this."
        rows = db.query(Incident).filter(Incident.priority == "Critical", Incident.status != "Closed").all()
        if not rows:
            return "No Critical-priority incidents are currently open."
        lines = "\n".join(f"• {r.code}: {r.type} at {r.location} — {r.reason or 'no reason logged'}" for r in rows[:10])
        return f"{len(rows)} Critical incident(s) currently open:\n{lines}"

    if "ward" in q and ("budget" in q or "highest" in q):
        if not (user and role in GOVERNMENT_ROLES):
            return "Ward budget data is restricted to Government/Analyst roles — sign in with one of those to ask this."
        wards = db.query(Ward).all()
        if not wards:
            return "No ward data is available yet."
        ranked = sorted(wards, key=lambda w: ward_score(w))
        w = ranked[0]
        return (f"{w.name} needs the most budget attention — lowest overall infrastructure score "
                f"({ward_score(w)}/100), with ₹{w.budget_used:,.0f} of ₹{w.budget_allocated:,.0f} already used.")

    if "bridge" in q and ("60" in q or "below" in q or "health" in q):
        if not (user and role in GOVERNMENT_ROLES):
            return "Ward/bridge health data is restricted to Government/Analyst roles — sign in with one of those to ask this."
        low = [w for w in db.query(Ward).all() if w.bridge_health < 60]
        if not low:
            return "No wards currently have bridge health below 60%."
        return "Wards below 60% bridge health: " + ", ".join(f"{w.name} ({w.bridge_health}%)" for w in low)

    if "maintenance" in q and ("cost" in q or "budget" in q or "predict" in q or "next month" in q):
        if not (user and role in MUNICIPALITY_ROLES):
            return "Maintenance budget forecasts are restricted to Municipality/Traffic/Government roles — sign in with one of those to ask this."
        open_incidents = db.query(Incident).filter(Incident.status != "Closed").all()
        high = [i for i in open_incidents if i.priority in ("Critical", "High")]
        f = budget_forecast(open_incidents, len(high))
        return (f"Predicted next-cycle maintenance: {f['expected_repairs']} repairs, "
                f"≈₹{f['estimated_budget_inr']:,.0f}, {f['workers_required']} workers, "
                f"{f['high_risk_roads']} high-risk roads flagged.")

    return None


async def get_reply(msg: str, context: dict | None = None, db: Session | None = None, user=None) -> tuple[str, str]:
    if db is not None:
        db_reply = try_db_answer(msg, db, user)
        if db_reply:
            return db_reply, "database"
    if settings.GEMINI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}",
                    json={"contents": [{"parts": [{"text": f"You are a concise traffic-intelligence assistant. Question: {msg}"}]}]},
                )
                r.raise_for_status()
                data = r.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return text, "gemini"
        except Exception:
            pass  # fall through to local
    return local_answer(msg, context), "local"

"""
Traffic ML engine -- a direct, documented port of the LSTM+RandomForest
*simulation* used in the original frontend (script.js `ML` object), moved
server-side so predictions are consistent across every client and can be
swapped for a real trained model later without touching the API contract.
"""
import random
from datetime import datetime

HIST = {0: 18, 1: 13, 2: 10, 3: 9, 4: 11, 5: 24, 6: 50, 7: 78, 8: 88, 9: 74,
        10: 58, 11: 52, 12: 62, 13: 52, 14: 57, 15: 63, 16: 72, 17: 84,
        18: 89, 19: 78, 20: 63, 21: 48, 22: 33, 23: 23}
DAY_MULT = [0.72, 0.9, 1.0, 1.0, 1.0, 1.1, 0.76]  # Mon..Sun style multiplier


def predict(distance_km: float, hour: int = None, dow: int = None) -> dict:
    now = datetime.now()
    h = hour if hour is not None else now.hour
    d = dow if dow is not None else now.weekday()

    base = HIST.get(h % 24, 50)
    dm = DAY_MULT[d % 7]
    weather_coeff = 1.15 if random.random() > 0.7 else 1.0
    noise = (random.random() - 0.5) * 11
    cg = max(5, min(96, base * dm * weather_coeff + noise))
    speed = max(6, 75 * (1 - cg / 100))
    t_min = round((distance_km / speed) * 60) if speed else 0
    base_min = round((distance_km / 75) * 60)
    delay = max(0, t_min - base_min)

    return {
        "congestion_pct": round(cg),
        "speed_kmh": round(speed),
        "eta_minutes": t_min,
        "delay_minutes": delay,
        "confidence": 0.934,
    }


def forecast(current_cg: int) -> list:
    now = datetime.now()
    out = []
    for off in (0, 30, 60, 120):
        fh = (now.hour + off // 60) % 24
        noise = (random.random() - 0.5) * 9
        out.append({"offset_min": off, "congestion_pct": max(5, min(96, round(HIST[fh] + noise)))})
    return out

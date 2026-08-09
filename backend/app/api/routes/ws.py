"""
Real-time live-traffic feed. Every connected client receives a simulated
(but server-authoritative) sensor snapshot every 8s -- this is the socket
the frontend's "Live Route Update" popup subscribes to instead of faking
values in the browser.
"""
import asyncio, random
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

WEATHER = ["Sunny", "Cloudy", "Rainy", "Foggy", "Stormy", "Partly Cloudy"]


def _snapshot():
    return {
        "temp_c": random.randint(20, 38),
        "weather": random.choice(WEATHER),
        "moisture_pct": random.randint(35, 90),
        "aqi": random.randint(40, 220),
        "congestion_pct": random.randint(10, 95),
        "flow_veh_hr": random.randint(400, 3200),
    }


@router.websocket("/ws/live")
async def live_feed(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await ws.send_json(_snapshot())
            await asyncio.sleep(8)
    except WebSocketDisconnect:
        pass

"""
Thin Redis wrapper. If Redis isn't reachable (e.g. running the backend
standalone without docker-compose), every call silently no-ops instead of
crashing the request -- this keeps local/dev usage zero-config while still
being real caching in the docker-compose / production stack.
"""
import json
from typing import Optional, Any
from .config import settings

try:
    import redis as redis_lib
    _client = redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=0.5)
    _client.ping()
except Exception:
    _client = None


def cache_get(key: str) -> Optional[Any]:
    if not _client:
        return None
    try:
        raw = _client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def cache_set(key: str, value: Any, ttl_seconds: int = 60):
    if not _client:
        return
    try:
        _client.set(key, json.dumps(value), ex=ttl_seconds)
    except Exception:
        pass

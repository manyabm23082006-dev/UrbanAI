"""
Central configuration. All values are overridable via environment variables
or a .env file (see .env.example). This is what makes the same codebase
"Postgres-ready": swap DATABASE_URL and nothing else changes.
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "UrbanGuard AI / TrafficAI Pro"
    SECRET_KEY: str = "dev-only-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    DATABASE_URL: str = "sqlite:///./trafficai.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    GEMINI_API_KEY: str = ""

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000,http://127.0.0.1:8000"

    # ── SMS / OTP ──────────────────────────────────────────────────
    #   "console"  -- prints the OTP to the server log instead of sending
    #                 a real SMS (default; zero-config for local dev/demo,
    #                 but the code does NOT reach an actual phone in this
    #                 mode -- only use it for testing).
    #   "twilio"   -- sends via Twilio's REST API.
    #   "webhook"  -- POSTs {"phone","message"} JSON to SMS_WEBHOOK_URL,
    #                 covering any other SMS gateway via a thin adapter.
    SMS_PROVIDER: str = "console"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    SMS_WEBHOOK_URL: str = ""
    SMS_WEBHOOK_TOKEN: str = ""

    OTP_LENGTH: int = 6
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 45
    OTP_MAX_PER_HOUR: int = 5
    # Whether registration is BLOCKED without a verified mobile OTP.
    # Defaults to False so the app still works out of the box before any
    # SMS provider is configured -- flip to True once SMS_PROVIDER is set
    # to twilio/webhook and you want real enforcement.
    OTP_REQUIRED_FOR_REGISTRATION: bool = False

    # ── IoT ingestion ──────────────────────────────────────────────
    #   If set, POST /api/v1/sensors/ingest requires a matching
    #   "X-Device-Key" header -- this is what stops anyone on the internet
    #   from injecting fake sensor readings. Left blank by default so the
    #   endpoint works out of the box for local demo/testing (matching
    #   this repo's other DEMO_MODE-style defaults); set it before
    #   exposing this endpoint publicly.
    IOT_DEVICE_KEY: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()

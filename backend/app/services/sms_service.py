"""
SMS delivery abstraction: one function, send_sms(phone, message), with
three interchangeable backends selected by settings.SMS_PROVIDER. Nothing
else in the codebase talks to a specific SMS API directly.
"""
import logging
from ..core.config import settings

logger = logging.getLogger("urbanguard.sms")


class SMSDeliveryError(Exception):
    pass


def send_sms(phone: str, message: str) -> None:
    provider = (settings.SMS_PROVIDER or "console").lower()
    if provider == "console":
        _send_console(phone, message)
    elif provider == "twilio":
        _send_twilio(phone, message)
    elif provider == "webhook":
        _send_webhook(phone, message)
    else:
        raise SMSDeliveryError(f"Unknown SMS_PROVIDER '{provider}' -- expected console, twilio, or webhook")


def _send_console(phone: str, message: str) -> None:
    banner = "=" * 60
    logger.warning(
        f"\n{banner}\n[SMS - CONSOLE MODE, NOT ACTUALLY SENT]\n"
        f"To: {phone}\nMessage: {message}\n"
        f"Set SMS_PROVIDER=twilio or SMS_PROVIDER=webhook in .env to send real SMS.\n{banner}"
    )


def _send_twilio(phone: str, message: str) -> None:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        raise SMSDeliveryError(
            "SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / "
            "TWILIO_FROM_NUMBER are not all set."
        )
    import httpx
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    try:
        r = httpx.post(
            url,
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            data={"From": settings.TWILIO_FROM_NUMBER, "To": phone, "Body": message},
            timeout=10,
        )
        if r.status_code >= 300:
            raise SMSDeliveryError(f"Twilio API returned {r.status_code}: {r.text[:300]}")
    except Exception as e:
        if isinstance(e, SMSDeliveryError):
            raise
        raise SMSDeliveryError(f"Could not reach Twilio: {e}")


def _send_webhook(phone: str, message: str) -> None:
    if not settings.SMS_WEBHOOK_URL:
        raise SMSDeliveryError("SMS_PROVIDER=webhook but SMS_WEBHOOK_URL is not set.")
    import httpx
    headers = {"Content-Type": "application/json"}
    if settings.SMS_WEBHOOK_TOKEN:
        headers["Authorization"] = f"Bearer {settings.SMS_WEBHOOK_TOKEN}"
    try:
        r = httpx.post(settings.SMS_WEBHOOK_URL, json={"phone": phone, "message": message}, headers=headers, timeout=10)
        if r.status_code >= 300:
            raise SMSDeliveryError(f"SMS webhook returned {r.status_code}: {r.text[:300]}")
    except Exception as e:
        if isinstance(e, SMSDeliveryError):
            raise
        raise SMSDeliveryError(f"Could not reach SMS webhook: {e}")

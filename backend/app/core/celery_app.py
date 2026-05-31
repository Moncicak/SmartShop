from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "smartcart",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.services.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Prague",
    enable_utc=True,
    task_track_started=True,
)

# Scheduled tasks (Celery Beat)
celery_app.conf.beat_schedule = {
    # Check Rohlik for price changes every 2 hours
    "check-rohlik-prices": {
        "task": "app.services.tasks.check_rohlik_prices",
        "schedule": crontab(minute=0, hour="*/2"),
    },
    # Morning shopping suggestion at 8:00
    "morning-shopping-suggestion": {
        "task": "app.services.tasks.suggest_shopping",
        "schedule": crontab(minute=0, hour=8),
    },
}

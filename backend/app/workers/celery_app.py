from celery import Celery
from celery.schedules import crontab
import os

celery_app = Celery(
    "tjsr",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2"),
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery_app.conf.beat_schedule = {
    "send-daily-digest": {
        "task": "app.workers.tasks.send_daily_digest",
        "schedule": crontab(hour=8, minute=0),
    },
    "scrape-all-sources": {
        "task": "app.workers.tasks.scrape_all_sources",
        "schedule": crontab(minute=0, hour="*/6"),  # every 6 hours
    },
}

celery_app.autodiscover_tasks(["app.workers"])

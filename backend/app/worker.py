from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "journaliste_sourcing",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Paris",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "check-job-changes": {
            "task": "app.tasks.check_job_changes",
            "schedule": crontab(hour=3, minute=0, day_of_week=0),  # Sunday 3am
        },
        "refresh-articles": {
            "task": "app.tasks.refresh_articles",
            "schedule": crontab(hour=4, minute=0),  # Daily 4am
        },
        "purge-inactive": {
            "task": "app.tasks.purge_inactive",
            "schedule": crontab(hour=2, minute=0, day_of_month=1),  # 1st of month 2am
        },
    },
)

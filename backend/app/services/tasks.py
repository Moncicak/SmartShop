"""Celery tasks — stubs for Phase 1, implemented in Phase 4."""
from app.core.celery_app import celery_app


@celery_app.task(name="app.services.tasks.check_rohlik_prices")
def check_rohlik_prices():
    """Check Rohlik.cz for price changes and update price_history. (Phase 2)"""
    print("[Celery] check_rohlik_prices — not yet implemented")


@celery_app.task(name="app.services.tasks.suggest_shopping")
def suggest_shopping():
    """Morning task: find best shopping window and notify user. (Phase 4)"""
    print("[Celery] suggest_shopping — not yet implemented")

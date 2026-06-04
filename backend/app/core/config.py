from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    ENVIRONMENT: str = "development"
    PROJECT_NAME: str = "SmartCart"
    VERSION: str = "0.1.0"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://smartcart:changeme@localhost:5432/smartcart_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    # Rohlík
    ROHLIK_EMAIL: str = ""
    ROHLIK_PASSWORD: str = ""
    ROHLIK_BASE_URL: str = "https://www.rohlik.cz"

    # AI
    ANTHROPIC_API_KEY: str = ""

    # Revolut
    REVOLUT_CLIENT_ID: str = ""
    REVOLUT_CLIENT_SECRET: str = ""
    REVOLUT_SANDBOX: bool = True

    # Firebase
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_PRIVATE_KEY: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"


settings = Settings()

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/journaliste_sourcing"
    )
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "change-me-in-production"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    CORS_ALLOW_ALL: bool = False

    SENTRY_DSN: str = ""

    LLM_PROVIDER: str = "gemini"
    LLM_API_KEY: str = ""

    DROPCONTACT_API_KEY: str = ""
    BRAVE_SEARCH_API_KEY: str = ""

    ENVIRONMENT: str = "development"

    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def post_init_fixes(self) -> "Settings":
        """Fix DATABASE_URL for asyncpg and ensure FRONTEND_URL is in CORS."""
        # Railway provides postgresql:// but asyncpg needs postgresql+asyncpg://
        self.DATABASE_URL = self.DATABASE_URL.strip()
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        # Always allow the frontend origin in CORS
        if self.FRONTEND_URL and self.FRONTEND_URL not in self.CORS_ORIGINS:
            self.CORS_ORIGINS.append(self.FRONTEND_URL)
        return self


settings = Settings()

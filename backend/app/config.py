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

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    SENTRY_DSN: str = ""

    LLM_PROVIDER: str = "gemini"
    LLM_API_KEY: str = ""

    DROPCONTACT_API_KEY: str = ""
    BRAVE_SEARCH_API_KEY: str = ""

    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

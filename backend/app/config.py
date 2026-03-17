from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "checkm8.db"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 1 week
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_prefix": "CHECKM8_", "env_file": ".env"}


settings = Settings()

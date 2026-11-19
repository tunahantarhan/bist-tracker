from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "BIST Tracker"
    API_V1_STR: str = "/api/v1"

    # Auth
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Admin-scoped sessions (issued only after 2FA) expire sooner
    ADMIN_REFRESH_TOKEN_EXPIRE_HOURS: int = 12
    EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    # Set-password link in invitations sent from the admin panel
    INVITE_TOKEN_EXPIRE_HOURS: int = 72
    # Window between a correct admin password and the 2FA code
    MFA_PENDING_TOKEN_EXPIRE_MINUTES: int = 5

    # Database
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgrespassword"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "bist_tracker_db"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    # Web
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    # Enable only behind a reverse proxy that sets X-Forwarded-For (used for rate limiting)
    TRUST_PROXY_HEADERS: bool = False

    # SMTP (email alerts are skipped when user/password are empty)
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # Background scanner
    SCAN_INTERVAL_MINUTES: int = 5
    # When False, notifications are produced even outside BIST trading hours (useful for local testing)
    NOTIFY_ONLY_WHEN_MARKET_OPEN: bool = True
    # Off-session the snapshot only needs refreshing occasionally (FX/gold keep moving)
    OFF_HOURS_SCAN_INTERVAL_MINUTES: int = 30

    # Yahoo Finance request budget (shared by scanner, charts and scripts in this process)
    YAHOO_MAX_RPS: float = 4.0          # token bucket refill rate
    YAHOO_BURST: int = 8                # token bucket capacity
    YAHOO_CONCURRENCY: int = 6          # simultaneous HTTP calls
    QUOTE_TTL_SECONDS: int = 60         # batch quote snapshot (single source of truth for prices)
    INTRADAY_REFRESH_MINUTES: int = 10  # incremental candle sync during the session
    DAILY_REFRESH_MINUTES: int = 360    # daily bars are kept current from quotes in between

    @computed_field
    @property
    def async_database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field
    @property
    def sync_database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field
    @property
    def redis_url(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str
    mongodb_db_name: str = "private_chat"
    invite_code_ttl_minutes: int = 10
    cors_allowed_origins: str = ""
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


settings = Settings()

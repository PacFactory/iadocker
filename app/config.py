import os
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # IA Configuration
    ia_config_file: str = "/config/ia.ini"
    
    # Download directory
    download_dir: str = "/data"
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8080
    
    # Job settings
    max_concurrent_downloads: int = 3
    max_concurrent_uploads: int = 2
    
    class Config:
        env_prefix = ""
        case_sensitive = False

    @property
    def ia_configured(self) -> bool:
        """Check if IA config file exists."""
        return Path(self.ia_config_file).exists()
    
    @property
    def download_path(self) -> Path:
        """Get download directory as Path."""
        path = Path(self.download_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()

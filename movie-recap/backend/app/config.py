from __future__ import annotations

import shutil
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    elevenlabs_api_key: str = ""

    storage_dir: str = "./storage"
    database_url: str = "sqlite:///./storage/movie_recap.db"
    max_video_duration_sec: int = 3600
    cors_origins: str = "*"

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=1)
def get_ffmpeg_binary() -> str:
    """Return system ffmpeg if on PATH, otherwise a standard-named ffmpeg.exe from imageio-ffmpeg."""
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    try:
        import os
        import imageio_ffmpeg

        src = Path(imageio_ffmpeg.get_ffmpeg_exe())
        # yt-dlp expects the binary to be named ffmpeg.exe on Windows
        bin_dir = get_settings().storage_path / "bin"
        bin_dir.mkdir(parents=True, exist_ok=True)
        target = bin_dir / ("ffmpeg.exe" if src.suffix.lower() == ".exe" else "ffmpeg")
        if not target.exists():
            try:
                os.link(src, target)
            except OSError:
                shutil.copy2(src, target)
        return str(target)
    except Exception as exc:
        raise RuntimeError(
            "FFmpeg not found. Install system ffmpeg or `pip install imageio-ffmpeg`."
        ) from exc

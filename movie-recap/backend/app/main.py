from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_ffmpeg_binary, get_settings
from app.db import init_db
from app.routes import pipeline, projects, voices


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Movie Recap & Review API",
        version="1.0.0",
        description="Analyze video URLs, detect language, transcribe, translate/recap into Burmese, and render multi-voice Burmese dubbed videos.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(projects.router)
    app.include_router(pipeline.router)
    app.include_router(voices.router)

    @app.get("/api/health")
    def health():
        ffmpeg_ok = False
        try:
            ffmpeg_ok = bool(get_ffmpeg_binary())
        except Exception:
            ffmpeg_ok = False
        return {
            "status": "ok",
            "ffmpeg_ready": ffmpeg_ok,
            "has_gemini_key": bool(settings.gemini_api_key),
            "has_openai_key": bool(settings.openai_api_key),
            "has_elevenlabs_key": bool(settings.elevenlabs_api_key),
        }

    return app


app = create_app()

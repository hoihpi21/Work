from __future__ import annotations

import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(500), default="Untitled Video")
    uploader: Mapped[str] = mapped_column(String(255), default="")
    platform: Mapped[str] = mapped_column(String(100), default="web")
    thumbnail_url: Mapped[str] = mapped_column(Text, default="")
    duration_sec: Mapped[float] = mapped_column(Float, default=0.0)

    detected_language: Mapped[str] = mapped_column(String(64), default="")
    detected_language_name: Mapped[str] = mapped_column(String(100), default="")
    language_confidence: Mapped[float] = mapped_column(Float, default=0.0)

    mode: Mapped[str] = mapped_column(String(32), default="recap")  # literal | recap
    recap_style: Mapped[str] = mapped_column(String(32), default="suspense")

    voice_id: Mapped[str] = mapped_column(String(64), default="riko")
    voice_speed: Mapped[float] = mapped_column(Float, default=1.0)
    voice_pitch: Mapped[int] = mapped_column(Integer, default=0)
    voice_style_prompt: Mapped[str] = mapped_column(Text, default="")
    # 0.0 = completely replace original voice/audio by default
    original_audio_volume: Mapped[float] = mapped_column(Float, default=0.0)
    burn_subtitles: Mapped[bool] = mapped_column(Boolean, default=False)

    status: Mapped[str] = mapped_column(String(32), default="analyzed")
    error_message: Mapped[str] = mapped_column(Text, default="")

    source_video_path: Mapped[str] = mapped_column(Text, default="")
    source_audio_path: Mapped[str] = mapped_column(Text, default="")
    dubbed_audio_path: Mapped[str] = mapped_column(Text, default="")
    dubbed_video_path: Mapped[str] = mapped_column(Text, default="")
    srt_path: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    segments: Mapped[list["Segment"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Segment.index",
    )
    jobs: Mapped[list["RenderJob"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="RenderJob.created_at.desc()",
    )


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_sec: Mapped[float] = mapped_column(Float, default=0.0)
    end_sec: Mapped[float] = mapped_column(Float, default=0.0)
    original_text: Mapped[str] = mapped_column(Text, default="")
    burmese_text: Mapped[str] = mapped_column(Text, default="")
    audio_path: Mapped[str] = mapped_column(Text, default="")

    project: Mapped[Project] = relationship(back_populates="segments")


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    project: Mapped[Project] = relationship(back_populates="jobs")

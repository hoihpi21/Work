from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class AnalyzeUrlRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)


class SegmentOut(BaseModel):
    id: str
    index: int
    start_sec: float
    end_sec: float
    original_text: str
    burmese_text: str

    model_config = {"from_attributes": True}


class SegmentPatchItem(BaseModel):
    id: str
    burmese_text: str
    start_sec: float | None = None
    end_sec: float | None = None


class SegmentsPatchRequest(BaseModel):
    segments: list[SegmentPatchItem]


class TranslateRequest(BaseModel):
    mode: Literal["literal", "recap"] = "recap"
    recap_style: Literal["suspense", "funny", "dramatic", "short60"] = "suspense"


class RenderRequest(BaseModel):
    voice_id: str = "riko"
    voice_speed: float = Field(default=1.0, ge=0.75, le=1.5)
    voice_pitch: int = Field(default=0, ge=-6, le=6)
    voice_style_prompt: str = Field(default="", max_length=500)
    # 0.0 completely replaces original voice/audio
    original_audio_volume: float = Field(default=0.0, ge=0.0, le=0.35)
    burn_subtitles: bool = False


class ImportTranscriptRequest(BaseModel):
    content: str = Field(..., min_length=1)
    format: str = "auto"
    target: Literal["original", "burmese"] = "original"


class CreateCustomVoiceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    burmese_label: str = Field(default="စိတ်ကြိုက် အသံ", max_length=100)
    gender: Literal["male", "female", "neutral"] = "female"
    age_group: Literal["young", "adult", "senior"] = "adult"
    pitch_label: Literal[
        "Low pitch", "Medium-low pitch", "Medium pitch", "High pitch", "Very high pitch"
    ] = "Medium pitch"
    use_case: str = Field(default="Movie Recap", max_length=60)
    style: str = Field(default="Warm and approachable.", max_length=120)
    style_prompt: str = Field(default="", max_length=400)


class JobOut(BaseModel):
    id: str
    project_id: str
    stage: str
    status: str
    progress: int
    message: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: str
    url: str
    title: str
    uploader: str
    platform: str
    thumbnail_url: str
    duration_sec: float
    detected_language: str
    detected_language_name: str
    language_confidence: float
    mode: str
    recap_style: str
    voice_id: str
    voice_speed: float
    voice_pitch: int
    voice_style_prompt: str = ""
    original_audio_volume: float
    burn_subtitles: bool
    status: str
    error_message: str
    has_source_video: bool = False
    has_source_audio: bool = False
    has_dubbed_audio: bool = False
    has_dubbed_video: bool = False
    has_srt: bool = False
    source_video_url: str | None = None
    source_audio_url: str | None = None
    dubbed_video_url: str | None = None
    dubbed_audio_url: str | None = None
    srt_url: str | None = None
    created_at: datetime
    updated_at: datetime
    segments: list[SegmentOut] = []

    model_config = {"from_attributes": True}


class VoiceStylePresetOut(BaseModel):
    id: str
    name: str
    prompt: str


class VoicePersonaOut(BaseModel):
    id: str
    name: str
    burmese_label: str
    language: str = "Burmese (မြန်မာ)"
    gender: Literal["male", "female", "neutral"]
    age_group: Literal["young", "adult", "senior"]
    pitch_label: str = "Medium pitch"
    use_case: str = "Movie Recap"
    style: str
    description: str
    provider: str
    preview_url: str

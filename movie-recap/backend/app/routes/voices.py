from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.schemas import CreateCustomVoiceRequest, VoicePersonaOut, VoiceStylePresetOut
from app.services.tts_engine import (
    VOICE_STYLE_PRESETS,
    get_all_voices,
    get_or_create_voice_preview,
    get_voice_by_id_map,
    register_custom_voice,
)

router = APIRouter(prefix="/api/voices", tags=["voices"])


def _to_persona_out(v) -> VoicePersonaOut:
    return VoicePersonaOut(
        id=v.id,
        name=v.name,
        burmese_label=v.burmese_label,
        language=getattr(v, "language", "Burmese (မြန်မာ)"),
        gender=v.gender,  # type: ignore[arg-type]
        age_group=v.age_group,  # type: ignore[arg-type]
        pitch_label=getattr(v, "pitch_label", "Medium pitch"),
        use_case=getattr(v, "use_case", "Movie Recap"),
        style=v.style,
        description=v.description,
        provider=v.provider,
        preview_url=f"/api/voices/{v.id}/preview",
    )


@router.get("", response_model=list[VoicePersonaOut])
def list_voices(
    gender: str | None = Query(default=None),
    age_group: str | None = Query(default=None),
    pitch_label: str | None = Query(default=None),
    use_case: str | None = Query(default=None),
    search: str | None = Query(default=None),
):
    items = get_all_voices()
    if isinstance(gender, str) and gender and gender != "all":
        items = [v for v in items if v.gender == gender]
    if isinstance(age_group, str) and age_group and age_group != "all":
        items = [v for v in items if v.age_group == age_group]
    if isinstance(pitch_label, str) and pitch_label and pitch_label != "all":
        items = [v for v in items if v.pitch_label.lower() == pitch_label.lower()]
    if isinstance(use_case, str) and use_case and use_case != "all":
        items = [v for v in items if v.use_case.lower() == use_case.lower()]
    if isinstance(search, str) and search.strip():
        q = search.strip().lower()
        items = [
            v
            for v in items
            if q in v.name.lower()
            or q in v.burmese_label.lower()
            or q in v.style.lower()
            or q in v.description.lower()
            or q in v.use_case.lower()
        ]

    return [_to_persona_out(v) for v in items]


@router.get("/style-presets", response_model=list[VoiceStylePresetOut])
def list_style_presets():
    return [
        VoiceStylePresetOut(id=p.id, name=p.name, prompt=p.prompt)
        for p in VOICE_STYLE_PRESETS
    ]


@router.post("/custom", response_model=VoicePersonaOut)
def create_custom_voice(body: CreateCustomVoiceRequest):
    persona = register_custom_voice(
        name=body.name,
        burmese_label=body.burmese_label,
        gender=body.gender,
        age_group=body.age_group,
        pitch_label=body.pitch_label,
        use_case=body.use_case,
        style=body.style,
        style_prompt=body.style_prompt,
    )
    return _to_persona_out(persona)


@router.get("/{voice_id}/preview")
async def preview_voice(
    voice_id: str,
    style_prompt: str = Query(default=""),
):
    if voice_id not in get_voice_by_id_map():
        raise HTTPException(status_code=404, detail="Voice persona not found")
    try:
        preview_path = await get_or_create_voice_preview(voice_id, style_prompt=style_prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate preview: {exc}") from exc

    return FileResponse(
        path=str(preview_path),
        media_type="audio/mpeg",
        filename=f"{voice_id}-preview.mp3",
    )

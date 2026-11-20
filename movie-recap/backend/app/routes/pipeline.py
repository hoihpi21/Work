from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.db import SessionLocal, get_db
from app.models import Project, Segment
from app.schemas import JobOut, RenderRequest, TranslateRequest
from app.services.job_manager import job_manager
from app.services.transcriber import transcribe_audio
from app.services.translator import generate_burmese_script
from app.services.tts_engine import get_voice_by_id_map, synthesize_burmese_speech
from app.services.url_analyzer import download_video_and_audio
from app.services.video_renderer import (
    TimedClip,
    build_voiceover_track,
    render_dubbed_video,
    write_burmese_srt,
)

router = APIRouter(prefix="/api/projects", tags=["pipeline"])


def _project_dir(project_id: str) -> Path:
    d = get_settings().storage_path / "projects" / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _run_transcribe_job(project_id: str, job_id: str) -> None:
    try:
        job_manager.update_job(
            job_id, status="running", progress=10, message="Loading video & extracting audio..."
        )
        with SessionLocal() as db:
            proj = db.get(Project, project_id)
            if not proj:
                raise RuntimeError("Project not found")
            url = proj.url
            hint_lang = proj.detected_language
            existing_video = Path(proj.source_video_path) if proj.source_video_path else None
            existing_audio = Path(proj.source_audio_path) if proj.source_audio_path else None
            proj.status = "transcribing"
            proj.error_message = ""
            db.commit()

        pdir = _project_dir(project_id)
        if existing_video and existing_video.exists() and existing_audio and existing_audio.exists():
            video_path, audio_path = existing_video, existing_audio
        else:
            video_path, audio_path = await asyncio.to_thread(download_video_and_audio, url, pdir)

        job_manager.update_job(
            job_id,
            progress=45,
            message="Detecting spoken language and generating transcript...",
        )
        result = await transcribe_audio(url, audio_path, pdir, hint_lang)

        job_manager.update_job(job_id, progress=85, message="Saving transcript segments...")
        with SessionLocal() as db:
            proj = db.get(Project, project_id)
            if not proj:
                raise RuntimeError("Project not found")
            proj.source_video_path = str(video_path)
            proj.source_audio_path = str(audio_path)
            proj.detected_language = result.language
            proj.detected_language_name = result.language_name
            proj.language_confidence = result.confidence
            proj.status = "transcribed"

            db.execute(delete(Segment).where(Segment.project_id == project_id))
            for idx, seg in enumerate(result.segments):
                db.add(
                    Segment(
                        project_id=project_id,
                        index=idx,
                        start_sec=seg.start_sec,
                        end_sec=seg.end_sec,
                        original_text=seg.text,
                        burmese_text="",
                    )
                )
            db.commit()

        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            message=f"Transcribed {len(result.segments)} segments ({result.language_name} via {result.provider}).",
        )
    except Exception as exc:
        job_manager.fail_project_and_job(project_id, job_id, exc)


async def _run_translate_job(
    project_id: str, job_id: str, mode: str, recap_style: str
) -> None:
    try:
        label = (
            f"Generating Burmese Movie Recap ({recap_style})..."
            if mode == "recap"
            else "Translating transcript into Burmese..."
        )
        job_manager.update_job(job_id, status="running", progress=15, message=label)

        with SessionLocal() as db:
            stmt = (
                select(Project)
                .options(selectinload(Project.segments))
                .where(Project.id == project_id)
            )
            proj = db.scalar(stmt)
            if not proj:
                raise RuntimeError("Project not found")
            if not proj.segments:
                raise RuntimeError("No transcript segments found. Transcribe or import a transcript first.")
            proj.mode = mode
            proj.recap_style = recap_style
            proj.status = "translating"
            proj.error_message = ""
            title = proj.title
            src_lang = proj.detected_language or "en"
            seg_dicts = [
                {
                    "index": s.index,
                    "start_sec": s.start_sec,
                    "end_sec": s.end_sec,
                    "original_text": s.original_text,
                }
                for s in proj.segments
            ]
            db.commit()

        job_manager.update_job(
            job_id, progress=45, message="Writing natural Burmese narration..."
        )
        translated = await generate_burmese_script(
            segments=seg_dicts,
            source_language=src_lang,
            title=title,
            mode=mode,
            recap_style=recap_style,
        )

        job_manager.update_job(job_id, progress=85, message="Saving Burmese script...")
        with SessionLocal() as db:
            proj = db.get(Project, project_id)
            if not proj:
                raise RuntimeError("Project not found")
            db.execute(delete(Segment).where(Segment.project_id == project_id))
            for item in translated:
                db.add(
                    Segment(
                        project_id=project_id,
                        index=item.index,
                        start_sec=item.start_sec,
                        end_sec=item.end_sec,
                        original_text=item.original_text,
                        burmese_text=item.burmese_text,
                    )
                )
            proj.status = "translated"
            db.commit()

        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            message=f"Burmese script ready ({len(translated)} scenes).",
        )
    except Exception as exc:
        job_manager.fail_project_and_job(project_id, job_id, exc)


async def _run_render_job(project_id: str, job_id: str, req: RenderRequest) -> None:
    try:
        job_manager.update_job(
            job_id,
            status="running",
            progress=5,
            message="Preparing Burmese voice-over synthesis...",
        )

        with SessionLocal() as db:
            stmt = (
                select(Project)
                .options(selectinload(Project.segments))
                .where(Project.id == project_id)
            )
            proj = db.scalar(stmt)
            if not proj:
                raise RuntimeError("Project not found")

            valid_segments = [s for s in proj.segments if s.burmese_text.strip()]
            if not valid_segments:
                raise RuntimeError("No Burmese script lines found. Generate or enter Burmese text first.")

            proj.voice_id = req.voice_id
            proj.voice_speed = req.voice_speed
            proj.voice_pitch = req.voice_pitch
            proj.voice_style_prompt = req.voice_style_prompt
            proj.original_audio_volume = req.original_audio_volume
            proj.burn_subtitles = req.burn_subtitles
            proj.status = "rendering"
            proj.error_message = ""
            mode = proj.mode
            url = proj.url
            existing_video = Path(proj.source_video_path) if proj.source_video_path else None
            seg_data = [
                (s.id, s.index, s.start_sec, s.end_sec, s.burmese_text.strip())
                for s in valid_segments
            ]
            db.commit()

        pdir = _project_dir(project_id)

        # If the user imported a transcript directly on a URL project without running Step 2 download yet, download now!
        if existing_video and existing_video.exists():
            source_video = existing_video
        elif url.startswith(("http://", "https://")):
            job_manager.update_job(
                job_id, progress=8, message="Downloading source video from URL..."
            )
            source_video, source_audio = await asyncio.to_thread(download_video_and_audio, url, pdir)
            with SessionLocal() as db:
                proj = db.get(Project, project_id)
                if proj:
                    proj.source_video_path = str(source_video)
                    proj.source_audio_path = str(source_audio)
                    db.commit()
        else:
            raise RuntimeError("Source video missing. Upload or download the video first.")

        tts_dir = pdir / "tts"
        tts_dir.mkdir(parents=True, exist_ok=True)

        clips: list[TimedClip] = []
        total = len(seg_data)
        for i, (seg_id, idx, start_s, end_s, my_text) in enumerate(seg_data):
            pct = 12 + int((i / max(1, total)) * 55)
            job_manager.update_job(
                job_id,
                progress=pct,
                message=f"Generating Burmese voice-over ({i + 1}/{total})...",
            )
            clip_path = tts_dir / f"seg_{idx:04d}.mp3"
            await synthesize_burmese_speech(
                text=my_text,
                out_mp3_path=clip_path,
                voice_id=req.voice_id,
                speed=req.voice_speed,
                pitch=req.voice_pitch,
                style_prompt=req.voice_style_prompt,
            )
            clips.append(
                TimedClip(
                    index=idx,
                    start_sec=start_s,
                    end_sec=end_s,
                    burmese_text=my_text,
                    audio_path=clip_path,
                )
            )

        job_manager.update_job(
            job_id, progress=72, message="Aligning Burmese voice-over audio track..."
        )
        dubbed_audio = pdir / "burmese_voiceover.mp3"
        dubbed_audio, aligned_clips = await asyncio.to_thread(
            build_voiceover_track, clips, dubbed_audio, tts_dir, mode
        )

        srt_path = pdir / "burmese_subtitles.srt"
        write_burmese_srt(aligned_clips, srt_path)

        job_manager.update_job(
            job_id,
            progress=85,
            message="Replacing original video voice with Burmese narration & rendering MP4...",
        )
        dubbed_video = pdir / "dubbed_video.mp4"
        await asyncio.to_thread(
            render_dubbed_video,
            source_video,
            dubbed_audio,
            dubbed_video,
            req.original_audio_volume,
            srt_path,
            req.burn_subtitles,
            mode,
        )

        with SessionLocal() as db:
            proj = db.get(Project, project_id)
            if proj:
                proj.dubbed_audio_path = str(dubbed_audio)
                proj.dubbed_video_path = str(dubbed_video)
                proj.srt_path = str(srt_path)
                proj.status = "completed"
                db.commit()

        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            message="Burmese dubbed video is ready to preview and download!",
        )
    except Exception as exc:
        job_manager.fail_project_and_job(project_id, job_id, exc)


@router.post("/{project_id}/transcribe", response_model=JobOut)
async def start_transcribe(project_id: str, db: Session = Depends(get_db)):
    proj = db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    job_id = job_manager.create_job(project_id, "transcribe", "Starting transcription...")
    asyncio.create_task(_run_transcribe_job(project_id, job_id))
    from app.models import RenderJob

    job = db.get(RenderJob, job_id)
    return JobOut.model_validate(job)


@router.post("/{project_id}/translate", response_model=JobOut)
async def start_translate(
    project_id: str, body: TranslateRequest, db: Session = Depends(get_db)
):
    proj = db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    job_id = job_manager.create_job(project_id, "translate", "Starting Burmese script generation...")
    asyncio.create_task(_run_translate_job(project_id, job_id, body.mode, body.recap_style))
    from app.models import RenderJob

    job = db.get(RenderJob, job_id)
    return JobOut.model_validate(job)


@router.post("/{project_id}/render", response_model=JobOut)
async def start_render(
    project_id: str, body: RenderRequest, db: Session = Depends(get_db)
):
    proj = db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    if body.voice_id not in get_voice_by_id_map():
        raise HTTPException(status_code=400, detail=f"Unknown voice_id: {body.voice_id}")

    job_id = job_manager.create_job(project_id, "render", "Queued voice-over rendering...")
    asyncio.create_task(_run_render_job(project_id, job_id, body))
    from app.models import RenderJob

    job = db.get(RenderJob, job_id)
    return JobOut.model_validate(job)

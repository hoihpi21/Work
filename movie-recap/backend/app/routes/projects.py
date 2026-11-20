from __future__ import annotations

import asyncio
import json
import re
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_ffmpeg_binary, get_settings
from app.db import get_db
from app.models import Project, RenderJob, Segment, new_id
from app.schemas import (
    AnalyzeUrlRequest,
    ImportTranscriptRequest,
    JobOut,
    ProjectOut,
    SegmentOut,
    SegmentsPatchRequest,
)
from app.services.job_manager import job_manager
from app.services.transcriber import parse_imported_transcript, transcribe_audio
from app.services.url_analyzer import analyze_video_url
from app.services.video_renderer import get_media_duration

router = APIRouter(prefix="/api", tags=["projects"])


def _safe_filename(title: str, ext: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\-_]+", "_", title).strip("_")[:60] or "movie_recap"
    return f"{slug}_burmese.{ext}"


def serialize_project(project: Project) -> ProjectOut:
    has_source = bool(project.source_video_path and Path(project.source_video_path).exists())
    has_source_audio = bool(project.source_audio_path and Path(project.source_audio_path).exists())
    has_audio = bool(project.dubbed_audio_path and Path(project.dubbed_audio_path).exists())
    has_video = bool(project.dubbed_video_path and Path(project.dubbed_video_path).exists())
    has_srt = bool(project.srt_path and Path(project.srt_path).exists())

    return ProjectOut(
        id=project.id,
        url=project.url,
        title=project.title,
        uploader=project.uploader,
        platform=project.platform,
        thumbnail_url=project.thumbnail_url,
        duration_sec=project.duration_sec,
        detected_language=project.detected_language,
        detected_language_name=project.detected_language_name,
        language_confidence=project.language_confidence,
        mode=project.mode,
        recap_style=project.recap_style,
        voice_id=project.voice_id,
        voice_speed=project.voice_speed,
        voice_pitch=project.voice_pitch,
        voice_style_prompt=getattr(project, "voice_style_prompt", "") or "",
        original_audio_volume=project.original_audio_volume,
        burn_subtitles=project.burn_subtitles,
        status=project.status,
        error_message=project.error_message,
        has_source_video=has_source,
        has_source_audio=has_source_audio,
        has_dubbed_audio=has_audio,
        has_dubbed_video=has_video,
        has_srt=has_srt,
        source_video_url=f"/api/projects/{project.id}/download/source" if has_source else None,
        source_audio_url=f"/api/projects/{project.id}/download/source-audio" if has_source_audio else None,
        dubbed_video_url=f"/api/projects/{project.id}/download/video" if has_video else None,
        dubbed_audio_url=f"/api/projects/{project.id}/download/audio" if has_audio else None,
        srt_url=f"/api/projects/{project.id}/download/srt" if has_srt else None,
        created_at=project.created_at,
        updated_at=project.updated_at,
        segments=[SegmentOut.model_validate(s) for s in project.segments],
    )


@router.post("/projects/analyze", response_model=ProjectOut)
async def analyze_url(body: AnalyzeUrlRequest, db: Session = Depends(get_db)):
    try:
        info = await asyncio.to_thread(analyze_video_url, body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not analyze video URL: {exc}"
        ) from exc

    project = Project(
        url=info.url,
        title=info.title,
        uploader=info.uploader,
        platform=info.platform,
        thumbnail_url=info.thumbnail_url,
        duration_sec=info.duration_sec,
        detected_language=info.detected_language,
        detected_language_name=info.detected_language_name,
        language_confidence=info.language_confidence,
        status="analyzed",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
ALLOWED_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus", ".wma"}
ALLOWED_MEDIA_EXTS = ALLOWED_VIDEO_EXTS | ALLOWED_AUDIO_EXTS


def _prepare_uploaded_video(raw_path: Path, project_dir: Path) -> tuple[Path, Path, Path | None, float]:
    ffmpeg_bin = get_ffmpeg_binary()
    final_video = project_dir / "source_video.mp4"
    source_audio = project_dir / "source_audio.mp3"
    ext = raw_path.suffix.lower()

    if ext in ALLOWED_AUDIO_EXTS:
        # Convert uploaded audio file to 16kHz mono MP3 for transcription
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                str(raw_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "64k",
                str(source_audio),
            ],
            check=True,
            capture_output=True,
        )
        dur = max(1.0, get_media_duration(source_audio))
        # Generate a lightweight 720p dark-slate video carrier so dubbed MP4 export works seamlessly
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"color=c=0x131823:s=1280x720:d={dur:.2f}:r=24",
                "-i",
                str(raw_path),
                "-shortest",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "stillimage",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(final_video),
            ],
            check=True,
            capture_output=True,
        )
        raw_path.unlink(missing_ok=True)
        return final_video, source_audio, None, dur

    if ext == ".mp4":
        if raw_path != final_video:
            shutil.move(str(raw_path), str(final_video))
    else:
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                str(raw_path),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(final_video),
            ],
            check=True,
            capture_output=True,
        )
        raw_path.unlink(missing_ok=True)

    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-i",
            str(final_video),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "64k",
            str(source_audio),
        ],
        check=True,
        capture_output=True,
    )

    thumb = project_dir / "thumbnail.jpg"
    try:
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-ss",
                "00:00:01",
                "-i",
                str(final_video),
                "-vframes",
                "1",
                "-q:v",
                "4",
                str(thumb),
            ],
            check=True,
            capture_output=True,
        )
    except Exception:
        thumb = None

    duration = get_media_duration(final_video)
    return final_video, source_audio, thumb if (thumb and thumb.exists()) else None, duration


@router.post("/projects/upload", response_model=ProjectOut)
async def upload_video_file(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    db: Session = Depends(get_db),
):
    orig_name = file.filename or "uploaded_media.mp4"
    ext = Path(orig_name).suffix.lower() or ".mp4"
    if ext not in ALLOWED_MEDIA_EXTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported media format '{ext}'. Allowed video/audio: "
                f"{', '.join(sorted(ALLOWED_MEDIA_EXTS))}"
            ),
        )

    project_id = new_id()
    pdir = get_settings().storage_path / "projects" / project_id
    pdir.mkdir(parents=True, exist_ok=True)
    raw_path = pdir / f"upload_raw{ext}"

    try:
        with raw_path.open("wb") as out_f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out_f.write(chunk)
    finally:
        await file.close()

    try:
        video_path, audio_path, thumb_path, duration = await asyncio.to_thread(
            _prepare_uploaded_video, raw_path, pdir
        )
    except Exception as exc:
        shutil.rmtree(pdir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=f"Could not process uploaded video: {exc}") from exc

    clean_title = (title.strip() or Path(orig_name).stem or "Uploaded Video")[:500]
    project = Project(
        id=project_id,
        url=f"upload://{orig_name}",
        title=clean_title,
        uploader="Local Upload",
        platform="upload",
        thumbnail_url=f"/api/projects/{project_id}/thumbnail" if thumb_path else "",
        duration_sec=duration,
        detected_language="",
        detected_language_name="Pending audio analysis",
        language_confidence=0.0,
        status="analyzed",
        source_video_path=str(video_path),
        source_audio_path=str(audio_path),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.get("/projects/{project_id}/thumbnail")
def get_project_thumbnail(project_id: str):
    thumb = get_settings().storage_path / "projects" / project_id / "thumbnail.jpg"
    if not thumb.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path=str(thumb), media_type="image/jpeg")


def _apply_imported_transcript(
    db: Session,
    project: Project,
    content: str,
    fmt: str,
    target: str,
) -> Project:
    parsed_segments = parse_imported_transcript(
        content=content,
        fmt=fmt,
        video_duration=project.duration_sec,
    )
    if not parsed_segments:
        raise HTTPException(
            status_code=400,
            detail="No transcript lines could be parsed from the provided text/file.",
        )

    db.execute(delete(Segment).where(Segment.project_id == project.id))
    for idx, seg in enumerate(parsed_segments):
        db.add(
            Segment(
                project_id=project.id,
                index=idx,
                start_sec=seg.start_sec,
                end_sec=seg.end_sec,
                original_text=seg.text if target == "original" else seg.text,
                burmese_text=seg.text if target == "burmese" else "",
            )
        )

    if not project.detected_language:
        project.detected_language = "my" if target == "burmese" else "imported"
        project.detected_language_name = (
            "Burmese (Imported)" if target == "burmese" else "Imported Transcript"
        )
        project.language_confidence = 1.0

    project.status = "translated" if target == "burmese" else "transcribed"
    project.error_message = ""
    db.commit()
    stmt = (
        select(Project)
        .options(selectinload(Project.segments))
        .where(Project.id == project.id)
    )
    return db.scalar(stmt) or project


@router.post("/projects/{project_id}/import-transcript", response_model=ProjectOut)
def import_transcript_text(
    project_id: str,
    body: ImportTranscriptRequest,
    db: Session = Depends(get_db),
):
    stmt = (
        select(Project)
        .options(selectinload(Project.segments))
        .where(Project.id == project_id)
    )
    project = db.scalar(stmt)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updated = _apply_imported_transcript(
        db=db,
        project=project,
        content=body.content,
        fmt=body.format,
        target=body.target,
    )
    return serialize_project(updated)


@router.post("/projects/{project_id}/import-transcript-file", response_model=ProjectOut)
async def import_transcript_file(
    project_id: str,
    file: UploadFile = File(...),
    target: str = Form(default="original"),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Project)
        .options(selectinload(Project.segments))
        .where(Project.id == project_id)
    )
    project = db.scalar(stmt)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    filename = (file.filename or "transcript.txt").lower()
    ext = Path(filename).suffix.lower()
    allowed_text_exts = {".srt", ".vtt", ".txt", ".rt", ".rtf", ".ass", ".ssa", ".sub", ".lrc", ".md", ".csv"}
    allowed_exts = allowed_text_exts | ALLOWED_AUDIO_EXTS
    if ext and ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file '{ext}'. Allowed transcript or audio files: "
                ".txt, .srt, .rt, .rtf, .vtt, .ass, .ssa, .sub, .lrc, .mp3, .wav, .m4a, .aac, .ogg, .flac, .opus, .wma"
            ),
        )

    clean_target = "burmese" if target == "burmese" else "original"

    # If the user uploaded an audio file (.mp3, .wav, .m4a, etc.) in Step 3, transcribe it automatically!
    if ext in ALLOWED_AUDIO_EXTS:
        pdir = get_settings().storage_path / "projects" / project.id
        pdir.mkdir(parents=True, exist_ok=True)
        raw_audio = pdir / f"imported_audio_raw{ext}"
        norm_audio = pdir / "imported_audio.mp3"
        try:
            with raw_audio.open("wb") as out_f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    out_f.write(chunk)
        finally:
            await file.close()

        ffmpeg_bin = get_ffmpeg_binary()
        await asyncio.to_thread(
            subprocess.run,
            [
                ffmpeg_bin,
                "-y",
                "-i",
                str(raw_audio),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "64k",
                str(norm_audio),
            ],
            check=True,
            capture_output=True,
        )
        raw_audio.unlink(missing_ok=True)

        res = await transcribe_audio(
            url="upload://imported_audio",
            audio_path=norm_audio,
            project_dir=pdir,
            hint_language="my" if clean_target == "burmese" else project.detected_language,
        )
        db.execute(delete(Segment).where(Segment.project_id == project.id))
        is_burmese = clean_target == "burmese" or res.language == "my"
        for idx, seg in enumerate(res.segments):
            db.add(
                Segment(
                    project_id=project.id,
                    index=idx,
                    start_sec=seg.start_sec,
                    end_sec=seg.end_sec,
                    original_text=seg.text,
                    burmese_text=seg.text if is_burmese else "",
                )
            )
        project.detected_language = res.language
        project.detected_language_name = res.language_name
        project.language_confidence = res.confidence
        project.status = "translated" if is_burmese else "transcribed"
        project.error_message = ""
        db.commit()
        refreshed = db.scalar(
            select(Project)
            .options(selectinload(Project.segments))
            .where(Project.id == project.id)
        )
        return serialize_project(refreshed or project)

    raw_bytes = await file.read()
    await file.close()
    text = raw_bytes.decode("utf-8", errors="replace")
    fmt = ext.lstrip(".") if ext in (".srt", ".vtt", ".rt", ".rtf", ".ass", ".ssa") else "txt"

    updated = _apply_imported_transcript(
        db=db,
        project=project,
        content=text,
        fmt=fmt,
        target=clean_target,
    )
    return serialize_project(updated)


@router.post("/projects/{project_id}/import-audio", response_model=ProjectOut)
async def import_audio_for_script(
    project_id: str,
    file: UploadFile = File(...),
    auto_transcribe: bool = Form(default=True),
    target: str = Form(default="original"),
    db: Session = Depends(get_db),
):
    """
    Import an audio file (.mp3, .wav, .m4a, .aac, .ogg, .flac, .opus, .wma) for the script.
    Can be used together with an uploaded transcription file (.txt/.srt/.rt) or auto-transcribed
    into script segments to translate into Burmese later.
    """
    stmt = (
        select(Project)
        .options(selectinload(Project.segments))
        .where(Project.id == project_id)
    )
    project = db.scalar(stmt)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    filename = (file.filename or "script_audio.mp3").lower()
    ext = Path(filename).suffix.lower() or ".mp3"
    if ext not in ALLOWED_AUDIO_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTS))}",
        )

    pdir = get_settings().storage_path / "projects" / project.id
    pdir.mkdir(parents=True, exist_ok=True)
    raw_audio = pdir / f"imported_audio_raw{ext}"
    norm_audio = pdir / "imported_script_audio.mp3"

    try:
        with raw_audio.open("wb") as out_f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out_f.write(chunk)
    finally:
        await file.close()

    ffmpeg_bin = get_ffmpeg_binary()
    await asyncio.to_thread(
        subprocess.run,
        [
            ffmpeg_bin,
            "-y",
            "-i",
            str(raw_audio),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "96k",
            str(norm_audio),
        ],
        check=True,
        capture_output=True,
    )
    raw_audio.unlink(missing_ok=True)

    project.source_audio_path = str(norm_audio)
    if not project.duration_sec or project.duration_sec <= 0:
        project.duration_sec = get_media_duration(norm_audio)

    clean_target = "burmese" if target == "burmese" else "original"
    if auto_transcribe:
        res = await transcribe_audio(
            url="upload://imported_audio",
            audio_path=norm_audio,
            project_dir=pdir,
            hint_language="my" if clean_target == "burmese" else project.detected_language,
        )
        db.execute(delete(Segment).where(Segment.project_id == project.id))
        is_burmese = clean_target == "burmese" or res.language == "my"
        for idx, seg in enumerate(res.segments):
            db.add(
                Segment(
                    project_id=project.id,
                    index=idx,
                    start_sec=seg.start_sec,
                    end_sec=seg.end_sec,
                    original_text=seg.text,
                    burmese_text=seg.text if is_burmese else "",
                )
            )
        project.detected_language = res.language
        project.detected_language_name = res.language_name
        project.language_confidence = res.confidence
        project.status = "translated" if is_burmese else "transcribed"

    project.error_message = ""
    db.commit()
    refreshed = db.scalar(
        select(Project)
        .options(selectinload(Project.segments))
        .where(Project.id == project.id)
    )
    return serialize_project(refreshed or project)


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    stmt = (
        select(Project)
        .options(selectinload(Project.segments))
        .order_by(Project.created_at.desc())
        .limit(50)
    )
    rows = db.scalars(stmt).all()
    return [serialize_project(p) for p in rows]


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    stmt = (
        select(Project)
        .options(selectinload(Project.segments))
        .where(Project.id == project_id)
    )
    project = db.scalar(stmt)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return serialize_project(project)


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()

    proj_dir = get_settings().storage_path / "projects" / project_id
    if proj_dir.exists():
        shutil.rmtree(proj_dir, ignore_errors=True)
    return {"deleted": True, "id": project_id}


@router.patch("/projects/{project_id}/segments", response_model=ProjectOut)
def update_segments(
    project_id: str, body: SegmentsPatchRequest, db: Session = Depends(get_db)
):
    stmt = (
        select(Project)
        .options(selectinload(Project.segments))
        .where(Project.id == project_id)
    )
    project = db.scalar(stmt)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    by_id: dict[str, Segment] = {s.id: s for s in project.segments}
    for patch in body.segments:
        seg = by_id.get(patch.id)
        if not seg:
            continue
        seg.burmese_text = patch.burmese_text.strip()
        if patch.start_sec is not None:
            seg.start_sec = patch.start_sec
        if patch.end_sec is not None:
            seg.end_sec = patch.end_sec

    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.get("/projects/{project_id}/download/{kind}")
def download_artifact(
    project_id: str,
    kind: str,
    inline: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if kind == "video":
        path_str, media_type, ext = project.dubbed_video_path, "video/mp4", "mp4"
    elif kind == "source":
        path_str, media_type, ext = project.source_video_path, "video/mp4", "mp4"
    elif kind == "source-audio":
        path_str, media_type, ext = project.source_audio_path, "audio/mpeg", "mp3"
    elif kind == "audio":
        path_str, media_type, ext = project.dubbed_audio_path, "audio/mpeg", "mp3"
    elif kind == "srt":
        path_str, media_type, ext = project.srt_path, "application/x-subrip", "srt"
    else:
        raise HTTPException(status_code=400, detail="Invalid download kind (video|source|audio|srt)")

    if not path_str or not Path(path_str).exists():
        raise HTTPException(status_code=404, detail=f"Requested {kind} has not been rendered yet")

    filename = _safe_filename(project.title, ext)
    headers = (
        {"Content-Disposition": f'inline; filename="{filename}"', "Accept-Ranges": "bytes"}
        if inline
        else {"Content-Disposition": f'attachment; filename="{filename}"'}
    )
    return FileResponse(path=path_str, media_type=media_type, headers=headers)


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(RenderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobOut.model_validate(job)


@router.get("/jobs/{job_id}/events")
async def stream_job_events(job_id: str):
    async def event_gen():
        async for payload in job_manager.stream_events(job_id):
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )

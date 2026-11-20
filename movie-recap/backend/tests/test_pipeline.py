from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from app.config import get_ffmpeg_binary
from app.db import init_db
from app.main import app
from app.services.transcriber import parse_imported_transcript, parse_vtt_file
from app.services.tts_engine import _parse_style_prompt
from app.services.url_analyzer import validate_video_url
from app.services.video_renderer import (
    TimedClip,
    build_voiceover_track,
    get_media_duration,
    render_dubbed_video,
    write_burmese_srt,
)


def test_health_and_voices():
    from app.routes.voices import list_voices

    init_db()
    assert bool(get_ffmpeg_binary()) is True

    # Verify core FastAPI routes & OpenAPI schema build cleanly
    route_paths = set(app.openapi()["paths"].keys())
    assert {
        "/api/health",
        "/api/voices",
        "/api/voices/style-presets",
        "/api/voices/custom",
        "/api/voices/{voice_id}/preview",
        "/api/projects/analyze",
        "/api/projects/upload",
        "/api/projects/{project_id}/import-transcript",
        "/api/projects/{project_id}/import-transcript-file",
        "/api/projects/{project_id}/transcribe",
        "/api/projects/{project_id}/translate",
        "/api/projects/{project_id}/render",
        "/api/projects/{project_id}/download/{kind}",
    } <= route_paths

    voices = list_voices(gender=None, age_group=None)
    assert len(voices) >= 16
    ids = {v.id for v in voices}
    assert {
        "riko",
        "bodi",
        "lumi",
        "sola",
        "koda",
        "adult-male-narrator",
        "adult-female-narrator",
        "young-lady",
        "old-man-storyteller",
    } <= ids

    # Filter by gender, age_group, pitch_label, and use_case
    young_female = list_voices(gender="female", age_group="young")
    assert len(young_female) >= 1
    assert all(v.gender == "female" and v.age_group == "young" for v in young_female)

    tutor_voices = list_voices(use_case="Tutor")
    assert {v.id for v in tutor_voices} >= {"bodi", "lumi", "sola"}

    # Style prompt parsing (Whisper, Friendly, Narration, Promote)
    r_w, p_w, f_w = _parse_style_prompt("whisper quietly")
    assert r_w < 0 and "lowpass" in f_w
    r_p, p_p, f_p = _parse_style_prompt("High energy, elongated vowels")
    assert r_p > 0 and "treble" in f_p


def test_url_ssrf_validation():
    assert validate_video_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ").startswith("https://")
    for bad in [
        "ftp://example.com/video.mp4",
        "http://localhost:8000/secret",
        "http://127.0.0.1/internal",
        "http://192.168.1.1/admin",
        "not-a-url",
    ]:
        with pytest.raises(ValueError):
            validate_video_url(bad)


def test_vtt_parser(tmp_path: Path):
    vtt = tmp_path / "sample.vtt"
    vtt.write_text(
        "WEBVTT\n\n"
        "00:00:00.500 --> 00:00:03.200\n"
        "In a world full of secrets.\n\n"
        "00:00:03.500 --> 00:00:07.000\n"
        "One hero rises to uncover the truth.\n",
        encoding="utf-8",
    )
    segs = parse_vtt_file(vtt)
    assert len(segs) == 2
    assert segs[0].start_sec == 0.5
    assert "secrets" in segs[0].text

    # Test SRT import parser
    srt_text = (
        "1\n00:00:01,000 --> 00:00:04,500\nFirst line of movie.\n\n"
        "2\n00:00:05,000 --> 00:00:09,000\nSecond line of movie.\n"
    )
    srt_segs = parse_imported_transcript(srt_text, fmt="srt")
    assert len(srt_segs) == 2
    assert srt_segs[0].start_sec == 1.0 and srt_segs[1].end_sec == 9.0

    # Test plain copy/paste TXT import parser
    txt_segs = parse_imported_transcript("Scene one opens.\nScene two twist.", fmt="txt", video_duration=20.0)
    assert len(txt_segs) == 2
    assert txt_segs[0].start_sec == 0.0 and txt_segs[1].end_sec == 20.0


def test_ffmpeg_voice_replacement_and_downloadable_mp4(tmp_path: Path):
    """Verify FFmpeg builds a Burmese voice-over track, replaces original audio, and creates valid MP4 + SRT."""
    ffmpeg_bin = get_ffmpeg_binary()

    # 1. Create a 3-second synthetic source video with an original 440Hz tone
    src_video = tmp_path / "source.mp4"
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=navy:s=320x240:d=3",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=3",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(src_video),
        ],
        check=True,
        capture_output=True,
    )

    # 2. Create two synthetic Burmese voice-over clips (1s each, 880Hz)
    clip1 = tmp_path / "clip1.mp3"
    clip2 = tmp_path / "clip2.mp3"
    for p in (clip1, clip2):
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=880:duration=1",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-b:a",
                "128k",
                str(p),
            ],
            check=True,
            capture_output=True,
        )

    clips = [
        TimedClip(0, 0.0, 1.0, "မင်္ဂလာပါ ဒီဇာတ်ကားက အရမ်းကောင်းပါတယ်။", clip1),
        TimedClip(1, 1.2, 2.2, "ဇာတ်သိမ်းပိုင်းက အံ့ဩစရာကောင်းတယ်။", clip2),
    ]

    vo_audio = tmp_path / "vo.mp3"
    vo_audio, aligned = build_voiceover_track(clips, vo_audio, tmp_path, mode="recap")
    assert vo_audio.exists() and vo_audio.stat().st_size > 1000
    assert len(aligned) == 2

    srt_path = tmp_path / "burmese.srt"
    write_burmese_srt(aligned, srt_path)
    assert "မင်္ဂလာပါ" in srt_path.read_text(encoding="utf-8")

    # 3. Replace original audio completely (original_audio_volume=0.0)
    out_mp4 = tmp_path / "dubbed.mp4"
    render_dubbed_video(
        source_video=src_video,
        voiceover_audio=vo_audio,
        out_video_mp4=out_mp4,
        original_audio_volume=0.0,
        srt_path=srt_path,
        burn_subtitles=False,
        mode="recap",
    )
    assert out_mp4.exists() and out_mp4.stat().st_size > 2000
    assert get_media_duration(out_mp4) >= 1.5

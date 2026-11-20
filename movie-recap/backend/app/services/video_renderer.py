from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.config import get_ffmpeg_binary


@dataclass
class TimedClip:
    index: int
    start_sec: float
    end_sec: float
    burmese_text: str
    audio_path: Path


def get_media_duration(path: Path) -> float:
    """Read media duration in seconds using ffmpeg stderr parsing (no ffprobe required)."""
    ffmpeg_bin = get_ffmpeg_binary()
    proc = subprocess.run(
        [ffmpeg_bin, "-i", str(path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", proc.stderr)
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def _format_srt_time(seconds: float) -> str:
    ms = max(0, int(round(seconds * 1000)))
    hrs = ms // 3_600_000
    ms %= 3_600_000
    mins = ms // 60_000
    ms %= 60_000
    secs = ms // 1000
    ms %= 1000
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def write_burmese_srt(clips: list[TimedClip], srt_path: Path) -> Path:
    lines: list[str] = []
    for idx, clip in enumerate(clips, start=1):
        lines.append(str(idx))
        lines.append(f"{_format_srt_time(clip.start_sec)} --> {_format_srt_time(clip.end_sec)}")
        lines.append(clip.burmese_text.strip())
        lines.append("")
    srt_path.write_text("\n".join(lines), encoding="utf-8")
    return srt_path


def _fit_clip_to_window(clip_path: Path, max_dur: float, fitted_path: Path) -> Path:
    """Gently speed up a TTS clip (up to 1.35x) if it exceeds its scene window."""
    actual = get_media_duration(clip_path)
    if actual <= 0 or max_dur <= 0.4 or actual <= max_dur:
        return clip_path

    ratio = min(1.35, actual / max_dur)
    ffmpeg_bin = get_ffmpeg_binary()
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-i",
            str(clip_path),
            "-af",
            f"atempo={ratio:.3f}",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-b:a",
            "128k",
            str(fitted_path),
        ],
        check=True,
        capture_output=True,
    )
    return fitted_path


def build_voiceover_track(
    clips: list[TimedClip],
    out_audio_mp3: Path,
    work_dir: Path,
    mode: str = "recap",
) -> tuple[Path, list[TimedClip]]:
    """
    Build a continuous Burmese voice-over track from synthesized segment clips.
    - In 'recap' mode: sequences clips smoothly with short 0.25s breaths and updates
      each clip's final subtitle timing so narration flows like a real movie recap.
    - In 'literal' mode: places each clip at its target timestamp without overlapping.
    """
    if not clips:
        raise ValueError("No Burmese voice-over segments to render.")

    ffmpeg_bin = get_ffmpeg_binary()
    concat_parts: list[Path] = []
    final_clips: list[TimedClip] = []
    cursor = 0.0

    def make_silence(dur: float, name: str) -> Path:
        sil = work_dir / f"sil_{name}.mp3"
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=44100:cl=stereo",
                "-t",
                f"{dur:.3f}",
                "-b:a",
                "128k",
                str(sil),
            ],
            check=True,
            capture_output=True,
        )
        return sil

    for i, clip in enumerate(clips):
        if mode == "literal":
            gap = clip.start_sec - cursor
            if gap > 0.12:
                concat_parts.append(make_silence(gap, f"gap_{i}"))
                cursor += gap
            next_start = clips[i + 1].start_sec if i + 1 < len(clips) else clip.end_sec + 2.0
            window = max(0.6, next_start - cursor)
            used_path = _fit_clip_to_window(clip.audio_path, window, work_dir / f"fit_{i}.mp3")
        else:
            # Recap/Review mode: smooth storytelling flow with 0.25s natural pauses
            if i > 0:
                concat_parts.append(make_silence(0.25, f"pause_{i}"))
                cursor += 0.25
            used_path = clip.audio_path

        dur = max(0.2, get_media_duration(used_path))
        concat_parts.append(used_path)
        final_clips.append(
            TimedClip(
                index=clip.index,
                start_sec=round(cursor, 2),
                end_sec=round(cursor + dur, 2),
                burmese_text=clip.burmese_text,
                audio_path=used_path,
            )
        )
        cursor += dur

    list_file = work_dir / "concat_list.txt"
    list_lines = [f"file '{p.resolve().as_posix()}'" for p in concat_parts]
    list_file.write_text("\n".join(list_lines), encoding="utf-8")

    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-ar",
            "44100",
            "-ac",
            "2",
            "-b:a",
            "192k",
            str(out_audio_mp3),
        ],
        check=True,
        capture_output=True,
    )
    return out_audio_mp3, final_clips


def render_dubbed_video(
    source_video: Path,
    voiceover_audio: Path,
    out_video_mp4: Path,
    original_audio_volume: float = 0.0,
    srt_path: Path | None = None,
    burn_subtitles: bool = False,
    mode: str = "recap",
) -> Path:
    """
    Replace the original video's voice/audio with the Burmese voice-over and produce
    a downloadable MP4 video.
    - original_audio_volume == 0.0 (default): completely replaces original voice/audio.
    - original_audio_volume > 0.0: mixes low background original audio under Burmese voice.
    - In 'recap' mode: trims video cleanly to match the Burmese narration duration if shorter.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    voice_dur = get_media_duration(voiceover_audio)
    video_dur = get_media_duration(source_video)

    cmd: list[str] = [ffmpeg_bin, "-y", "-i", str(source_video), "-i", str(voiceover_audio)]

    filter_parts: list[str] = []
    video_map = "0:v:0"

    if burn_subtitles and srt_path and srt_path.exists():
        # Escape Windows path colons/backslashes for FFmpeg subtitles filter
        escaped_srt = (
            srt_path.resolve()
            .as_posix()
            .replace(":", "\\:")
            .replace("'", "\\'")
        )
        filter_parts.append(
            f"[0:v:0]subtitles='{escaped_srt}':force_style='FontName=Noto Sans Myanmar,FontSize=20,Outline=2'[vout]"
        )
        video_map = "[vout]"

    if original_audio_volume <= 0.001:
        # Completely replace original audio/voice with the Burmese voice-over
        audio_map = "1:a:0"
    else:
        vol = max(0.0, min(0.35, original_audio_volume))
        filter_parts.append(
            f"[0:a:0]volume={vol:.3f}[bg];[1:a:0]volume=1.0[vo];"
            f"[bg][vo]amix=inputs=2:duration=longest:dropout_transition=2[aout]"
        )
        audio_map = "[aout]"

    if filter_parts:
        cmd += ["-filter_complex", ";".join(filter_parts)]

    cmd += ["-map", video_map, "-map", audio_map]

    # Video codec: copy if no subtitle burn-in for super fast export, otherwise H.264
    if video_map == "0:v:0":
        cmd += ["-c:v", "copy"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22"]

    cmd += ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]

    # In recap mode, match output length to the Burmese voice-over (if video is longer)
    if mode == "recap" and voice_dur > 0 and video_dur > voice_dur + 1.0:
        cmd += ["-t", f"{voice_dur + 0.5:.2f}"]
    elif video_dur > 0 and voice_dur > 0:
        cmd += ["-shortest"]

    cmd.append(str(out_video_mp4))
    subprocess.run(cmd, check=True, capture_output=True)
    return out_video_mp4

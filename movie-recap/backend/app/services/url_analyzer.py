from __future__ import annotations

import ipaddress
import re
import shutil
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx
import yt_dlp

from app.config import get_ffmpeg_binary, get_settings

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "my": "Burmese (မြန်မာ)",
    "ko": "Korean",
    "ja": "Japanese",
    "zh": "Chinese",
    "zh-cn": "Chinese (Simplified)",
    "zh-tw": "Chinese (Traditional)",
    "th": "Thai",
    "hi": "Hindi",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ru": "Russian",
    "vi": "Vietnamese",
    "id": "Indonesian",
    "ar": "Arabic",
    "pt": "Portuguese",
    "it": "Italian",
    "tr": "Turkish",
}

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
}

DIRECT_VIDEO_EXTS = (".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi", ".m3u8", ".mpd")


def language_name_for(code: str) -> str:
    if not code:
        return "Unknown"
    norm = code.lower().strip()
    if norm in LANGUAGE_NAMES:
        return LANGUAGE_NAMES[norm]
    base = norm.split("-")[0].split("_")[0]
    return LANGUAGE_NAMES.get(base, code.upper())


def validate_video_url(url: str) -> str:
    """Validate URL format and block private/loopback hosts (SSRF protection)."""
    cleaned = url.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")
    if not parsed.netloc or not parsed.hostname:
        raise ValueError("URL must contain a valid hostname")

    host = parsed.hostname.lower()
    if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or host.endswith(".local"):
        raise ValueError("Local or internal URLs are not allowed")

    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("Private network IP addresses are not allowed")
    except ValueError as err:
        if "not allowed" in str(err):
            raise
        try:
            infos = socket.getaddrinfo(host, None)
            for info in infos:
                resolved_ip = ipaddress.ip_address(info[4][0])
                if (
                    resolved_ip.is_private
                    or resolved_ip.is_loopback
                    or resolved_ip.is_link_local
                    or resolved_ip.is_reserved
                ):
                    raise ValueError("URL resolves to a private or internal network address")
        except socket.gaierror:
            pass

    return cleaned


@dataclass
class AnalyzedVideo:
    url: str
    title: str
    uploader: str
    platform: str
    thumbnail_url: str
    duration_sec: float
    detected_language: str
    detected_language_name: str
    language_confidence: float


def _is_direct_media_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in DIRECT_VIDEO_EXTS)


def _probe_direct_url_duration(url: str) -> float:
    """Use FFmpeg to quickly inspect duration of a direct MP4/M3U8/WebM URL."""
    ffmpeg_bin = get_ffmpeg_binary()
    try:
        proc = subprocess.run(
            [ffmpeg_bin, "-nostdin", "-i", url],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=15,
        )
        m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", proc.stderr)
        if m:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    except Exception:
        pass
    return 0.0


def analyze_video_url(url: str) -> AnalyzedVideo:
    """
    Inspect a YouTube or any other valid video URL (Vimeo, TikTok, Facebook, Instagram,
    Dailymotion, Bilibili, X/Twitter, Twitch, or direct MP4/WebM/M3U8 link).
    """
    valid_url = validate_video_url(url)
    settings = get_settings()
    parsed = urlparse(valid_url)
    host_label = (parsed.hostname or "web").replace("www.", "")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "extract_flat": False,
        "socket_timeout": 20,
        "http_headers": DEFAULT_HEADERS,
    }

    info = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(valid_url, download=False)
            if info and "entries" in info and info["entries"]:
                entries = [e for e in info["entries"] if e]
                if entries:
                    info = entries[0]
    except Exception as ydl_exc:
        # Fallback for direct video links or websites where yt-dlp metadata extraction fails
        if not _is_direct_media_url(valid_url):
            try:
                with httpx.Client(timeout=12.0, follow_redirects=True, headers=DEFAULT_HEADERS) as client:
                    head = client.head(valid_url)
                    ctype = (head.headers.get("content-type") or "").lower()
                    if not (ctype.startswith("video/") or ctype.startswith("audio/") or "mpegurl" in ctype):
                        raise ydl_exc
            except Exception:
                raise ValueError(f"Could not analyze video URL: {ydl_exc}") from ydl_exc

    if info:
        duration = float(info.get("duration") or 0.0)
        if duration > settings.max_video_duration_sec:
            raise ValueError(
                f"Video is {int(duration // 60)} min long, exceeding the "
                f"{settings.max_video_duration_sec // 60}-minute limit."
            )

        lang = (info.get("language") or "").strip()
        confidence = 0.85 if lang else 0.0
        if not lang:
            subs = info.get("subtitles") or {}
            auto_subs = info.get("automatic_captions") or {}
            for candidate in ("en", "ko", "ja", "zh", "th", "hi", "es", "fr", "my"):
                if candidate in subs:
                    lang = candidate
                    confidence = 0.7
                    break
            if not lang and auto_subs:
                first_key = next(iter(auto_subs.keys()), "")
                if first_key:
                    lang = first_key.split("-")[0]
                    confidence = 0.5

        extractor = info.get("extractor_key") or host_label
        if extractor.lower() == "generic":
            extractor = host_label

        return AnalyzedVideo(
            url=valid_url,
            title=(info.get("title") or Path(unquote(parsed.path)).stem or "Web Video")[:500],
            uploader=(info.get("uploader") or info.get("channel") or host_label)[:255],
            platform=str(extractor)[:100],
            thumbnail_url=info.get("thumbnail") or "",
            duration_sec=duration,
            detected_language=lang,
            detected_language_name=language_name_for(lang) if lang else "Pending audio analysis",
            language_confidence=confidence,
        )

    # Direct video URL fallback
    duration = _probe_direct_url_duration(valid_url)
    raw_name = Path(unquote(parsed.path)).stem or "Direct Video"
    return AnalyzedVideo(
        url=valid_url,
        title=raw_name[:500],
        uploader=host_label[:255],
        platform=host_label[:100],
        thumbnail_url="",
        duration_sec=duration,
        detected_language="",
        detected_language_name="Pending audio analysis",
        language_confidence=0.0,
    )


def _ensure_valid_mp4_and_audio(source_video: Path, project_dir: Path) -> tuple[Path, Path]:
    """Ensure fast-seekable MP4 video + 16kHz mono MP3 audio."""
    ffmpeg_bin = get_ffmpeg_binary()
    final_video = project_dir / "source_video.mp4"

    if source_video != final_video:
        # Try fast lossless container remux first; fall back to transcode only if codecs are incompatible
        remux = subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                str(source_video),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(final_video),
            ],
            capture_output=True,
        )
        if remux.returncode != 0 or not final_video.exists() or final_video.stat().st_size < 1024:
            subprocess.run(
                [
                    ffmpeg_bin,
                    "-y",
                    "-i",
                    str(source_video),
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
        source_video.unlink(missing_ok=True)
        source_video = final_video

    source_audio = project_dir / "source_audio.mp3"
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-i",
            str(source_video),
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
    return source_video, source_audio


def download_video_and_audio(url: str, project_dir: Path) -> tuple[Path, Path]:
    """
    Download video (up to 720p MP4) from YouTube or any other valid video URL
    with concurrent fragment acceleration and direct HTTP/FFmpeg fallback.
    """
    project_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg_bin = get_ffmpeg_binary()

    # Clean up partial files from any interrupted previous attempt
    for old in project_dir.glob("source_video*.part*"):
        old.unlink(missing_ok=True)

    video_out_tmpl = str(project_dir / "source_video.%(ext)s")
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": (
            "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/"
            "best[height<=720][ext=mp4]/best[height<=720]/best"
        ),
        "merge_output_format": "mp4",
        "outtmpl": video_out_tmpl,
        "ffmpeg_location": ffmpeg_bin,
        "concurrent_fragment_downloads": 4,
        "retries": 3,
        "fragment_retries": 3,
        "socket_timeout": 30,
        "http_headers": DEFAULT_HEADERS,
    }

    downloaded: Path | None = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        candidates = [
            p
            for p in sorted(project_dir.glob("source_video.*"))
            if not p.name.endswith(".part") and p.stat().st_size > 0
        ]
        if candidates:
            downloaded = candidates[0]
    except Exception:
        downloaded = None

    # Fallback: direct HTTP stream or FFmpeg network pull for non-YouTube / direct video links
    if not downloaded:
        raw_target = project_dir / "source_video.raw.mp4"
        try:
            proc = subprocess.run(
                [
                    ffmpeg_bin,
                    "-y",
                    "-nostdin",
                    "-user_agent",
                    DEFAULT_HEADERS["User-Agent"],
                    "-i",
                    url,
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
                    str(raw_target),
                ],
                capture_output=True,
                timeout=300,
            )
            if proc.returncode == 0 and raw_target.exists() and raw_target.stat().st_size > 1024:
                downloaded = raw_target
        except Exception:
            downloaded = None

    if not downloaded:
        try:
            raw_http = project_dir / "source_video.http"
            with httpx.Client(timeout=120.0, follow_redirects=True, headers=DEFAULT_HEADERS) as client:
                with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    with raw_http.open("wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=512 * 1024):
                            f.write(chunk)
            if raw_http.exists() and raw_http.stat().st_size > 1024:
                downloaded = raw_http
        except Exception as exc:
            raise RuntimeError(f"Failed to download video from URL: {exc}") from exc

    if not downloaded:
        raise RuntimeError("Failed to download source video from URL.")

    return _ensure_valid_mp4_and_audio(downloaded, project_dir)


def download_captions_vtt(url: str, project_dir: Path, preferred_lang: str = "") -> tuple[Path | None, str]:
    """Attempt to download existing subtitles or auto-captions as VTT (fast fallback)."""
    subs_dir = project_dir / "subs"
    subs_dir.mkdir(parents=True, exist_ok=True)
    langs = (
        [f"{preferred_lang}.*", preferred_lang]
        if preferred_lang
        else ["en.*", "ko.*", "ja.*", "zh.*", "th.*", "hi.*", "es.*", "fr.*", "my.*"]
    )

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": langs,
        "subtitlesformat": "vtt",
        "outtmpl": str(subs_dir / "cap.%(ext)s"),
        "socket_timeout": 15,
        "http_headers": DEFAULT_HEADERS,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception:
        return None, preferred_lang

    vtts = sorted(subs_dir.glob("*.vtt"))
    if not vtts:
        return None, preferred_lang

    chosen = vtts[0]
    m = re.search(r"cap\.([a-zA-Z\-]+)\.vtt$", chosen.name)
    detected = m.group(1) if m else (preferred_lang or "en")
    return chosen, detected

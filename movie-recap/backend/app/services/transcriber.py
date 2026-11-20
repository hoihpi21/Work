from __future__ import annotations

import asyncio
import base64
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import httpx

from app.config import get_settings
from app.services.url_analyzer import download_captions_vtt, language_name_for


@dataclass
class TranscriptSegment:
    start_sec: float
    end_sec: float
    text: str


@dataclass
class TranscriptionResult:
    language: str
    language_name: str
    confidence: float
    segments: list[TranscriptSegment]
    provider: str


def _parse_timestamp(ts: str) -> float:
    parts = ts.strip().replace(",", ".").split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def parse_vtt_file(vtt_path: Path) -> list[TranscriptSegment]:
    """Parse WebVTT captions into clean, deduplicated timestamped segments."""
    raw = vtt_path.read_text(encoding="utf-8", errors="ignore")
    blocks = re.split(r"\r?\n\r?\n", raw)
    segments: list[TranscriptSegment] = []
    time_re = re.compile(r"([\d:.]+)\s*-->\s*([\d:.]+)")

    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        match = None
        text_start = 0
        for idx, line in enumerate(lines):
            m = time_re.search(line)
            if m:
                match = m
                text_start = idx + 1
                break
        if not match:
            continue
        start = _parse_timestamp(match.group(1))
        end = _parse_timestamp(match.group(2))
        text = " ".join(lines[text_start:])
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        if segments and segments[-1].text == text:
            segments[-1].end_sec = max(segments[-1].end_sec, end)
            continue
        segments.append(TranscriptSegment(start_sec=round(start, 2), end_sec=round(end, 2), text=text))

    return _merge_short_segments(segments)


def _clean_special_subtitle_formats(raw: str, fmt: str) -> str:
    """Normalize .rt (RealText), .rtf, .ass/.ssa, and .lrc into timestamped or plain lines."""
    text = raw
    # 1. Strip RTF control sequences if RTF file
    if fmt == "rtf" or text.lstrip().startswith("{\\rtf"):
        text = re.sub(r"\\par[d]?\b", "\n", text)
        text = re.sub(r"\\'[0-9a-fA-F]{2}", "", text)
        text = re.sub(r"\\[a-zA-Z]+\-?\d*\s?", "", text)
        text = text.replace("{", "").replace("}", "")

    # 2. RealText (.rt): <Time begin="0:00:02.0" end="0:00:05.0"/>Line<br/>
    if "<time" in text.lower() or fmt == "rt":
        rt_lines: list[str] = []
        pattern = re.compile(
            r'<time\s+[^>]*begin=["\']([^"\']+)["\'][^>]*>(.*?)(?=<time|\Z)',
            re.IGNORECASE | re.DOTALL,
        )
        matches = list(pattern.finditer(text))
        if matches:
            for m in matches:
                ts = m.group(1).strip()
                body = re.sub(r"<[^>]+>", " ", m.group(2))
                body = re.sub(r"\s+", " ", body).strip()
                if body:
                    rt_lines.append(f"[{ts}] {body}")
            if rt_lines:
                return "\n".join(rt_lines)
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)

    # 3. ASS / SSA: Dialogue: 0,0:00:01.00,0:00:04.50,Default,,0,0,0,,Text
    if "dialogue:" in text.lower() or fmt in ("ass", "ssa"):
        ass_lines: list[str] = []
        for ln in text.splitlines():
            if ln.strip().lower().startswith("dialogue:"):
                parts = ln.split(",", 9)
                if len(parts) >= 10:
                    st, en, body = parts[1].strip(), parts[2].strip(), parts[9].strip()
                    body = re.sub(r"\{[^}]*\}", "", body).replace("\\N", " ").replace("\\n", " ").strip()
                    if body:
                        ass_lines.append(f"{st} - {en} {body}")
        if ass_lines:
            return "\n".join(ass_lines)

    return text


def parse_imported_transcript(
    content: str,
    fmt: str = "auto",
    video_duration: float = 0.0,
) -> list[TranscriptSegment]:
    """
    Parse user-supplied transcript text from:
    - SRT (.srt)
    - WebVTT (.vtt)
    - RealText (.rt), Rich Text (.rtf), ASS/SSA (.ass/.ssa), LRC (.lrc), SUB (.sub)
    - Timestamped lines (e.g. '[00:12] Hello' or '0:12 - 0:18 Hello')
    - Plain copy/pasted text (.txt) -> auto-timed across video_duration
    """
    raw = (content or "").lstrip("\ufeff").strip()
    if not raw:
        return []
    raw = _clean_special_subtitle_formats(raw, fmt.lower())

    time_arrow_re = re.compile(r"(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)")

    # 1. SRT / VTT blocks with '-->'
    if fmt in ("srt", "vtt") or "-->" in raw:
        blocks = re.split(r"\r?\n\r?\n+", raw)
        segments: list[TranscriptSegment] = []
        for block in blocks:
            lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
            if not lines:
                continue
            match = None
            text_start = 0
            for idx, ln in enumerate(lines):
                m = time_arrow_re.search(ln)
                if m:
                    match = m
                    text_start = idx + 1
                    break
            if not match:
                continue
            start_s = _parse_timestamp(match.group(1))
            end_s = max(start_s + 0.5, _parse_timestamp(match.group(2)))
            txt = " ".join(lines[text_start:])
            txt = re.sub(r"<[^>]+>", "", txt)
            txt = re.sub(r"\s+", " ", txt).strip()
            if txt:
                segments.append(
                    TranscriptSegment(start_sec=round(start_s, 2), end_sec=round(end_s, 2), text=txt)
                )
        if segments:
            return segments

    # 2. Inline timestamped lines: "[00:12] text" or "00:12 - 00:18 text"
    inline_re = re.compile(
        r"^[\[\(]?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*(?:[-–—to]+\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?))?[\]\)]?[\s:|\-]+(.+)$"
    )
    raw_lines = [ln.strip() for ln in raw.splitlines() if ln.strip() and ln.strip().upper() != "WEBVTT"]
    inline_matches = [inline_re.match(ln) for ln in raw_lines]
    if raw_lines and sum(1 for m in inline_matches if m) >= max(1, len(raw_lines) // 2):
        timed: list[TranscriptSegment] = []
        for i, ln in enumerate(raw_lines):
            m = inline_matches[i]
            if not m:
                if timed:
                    timed[-1].text = f"{timed[-1].text} {ln}".strip()
                continue
            st = _parse_timestamp(m.group(1))
            en = _parse_timestamp(m.group(2)) if m.group(2) else st + 4.5
            timed.append(TranscriptSegment(start_sec=round(st, 2), end_sec=round(max(st + 0.5, en), 2), text=m.group(3).strip()))
        for i in range(len(timed) - 1):
            if timed[i + 1].start_sec > timed[i].start_sec:
                timed[i].end_sec = round(min(timed[i].end_sec, timed[i + 1].start_sec), 2)
        if timed:
            return timed

    # 3. Plain text paragraphs / sentences (.txt or copy-paste)
    chunks: list[str] = []
    for line in raw_lines:
        # Split very long paragraphs into sentence-sized narration beats
        if len(line) > 180:
            parts = [p.strip() for p in re.split(r"(?<=[.!?။])\s+", line) if p.strip()]
            chunks.extend(parts)
        else:
            chunks.append(line)

    if not chunks:
        return []

    total_dur = video_duration if video_duration and video_duration > 2.0 else len(chunks) * 4.5
    step = max(1.5, total_dur / len(chunks))
    plain_segments: list[TranscriptSegment] = []
    for idx, txt in enumerate(chunks):
        st = round(idx * step, 2)
        en = round(min(total_dur, (idx + 1) * step) if video_duration > 2.0 else (idx + 1) * step, 2)
        plain_segments.append(
            TranscriptSegment(start_sec=st, end_sec=max(st + 1.0, en), text=txt)
        )
    return plain_segments


def _merge_short_segments(
    segments: list[TranscriptSegment], max_duration: float = 10.0, min_chars: int = 24
) -> list[TranscriptSegment]:
    """Merge tiny 1-second caption fragments into natural sentences for cleaner dubbing."""
    if not segments:
        return []
    merged: list[TranscriptSegment] = [segments[0]]
    for seg in segments[1:]:
        prev = merged[-1]
        gap = seg.start_sec - prev.end_sec
        combined_dur = seg.end_sec - prev.start_sec
        if gap < 1.2 and combined_dur <= max_duration and len(prev.text) < min_chars:
            prev.end_sec = max(prev.end_sec, seg.end_sec)
            if not prev.text.endswith(seg.text):
                prev.text = f"{prev.text} {seg.text}".strip()
        else:
            merged.append(seg)
    return merged


async def _transcribe_with_gemini(audio_path: Path) -> TranscriptionResult:
    settings = get_settings()
    audio_bytes = audio_path.read_bytes()
    b64_audio = base64.b64encode(audio_bytes).decode("ascii")

    prompt = (
        "Detect the primary spoken language in this audio and transcribe it into clean "
        "timestamped segments (5 to 12 seconds each). Return STRICT JSON ONLY matching:\n"
        '{"language": "iso-639-1 code like en, ko, ja, zh, th, hi, my", '
        '"confidence": 0.95, '
        '"segments": [{"start_sec": 0.0, "end_sec": 6.5, "text": "..."}]}'
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    headers = {"x-goog-api-key": settings.gemini_api_key}
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "audio/mp3", "data": b64_audio}},
                ]
            }
        ],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text[:300]}")
        data = resp.json()

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    parsed = json.loads(text)
    lang = (parsed.get("language") or "en").strip().lower()
    conf = float(parsed.get("confidence") or 0.92)
    segs = [
        TranscriptSegment(
            start_sec=float(s.get("start_sec", 0.0)),
            end_sec=float(s.get("end_sec", 0.0)),
            text=str(s.get("text", "")).strip(),
        )
        for s in parsed.get("segments", [])
        if str(s.get("text", "")).strip()
    ]
    return TranscriptionResult(
        language=lang,
        language_name=language_name_for(lang),
        confidence=conf,
        segments=segs,
        provider="gemini",
    )


async def _transcribe_with_openai(audio_path: Path) -> TranscriptionResult:
    settings = get_settings()
    url = "https://api.openai.com/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}

    async with httpx.AsyncClient(timeout=180.0) as client:
        with audio_path.open("rb") as f:
            files = {"file": (audio_path.name, f, "audio/mpeg")}
            data = {
                "model": "whisper-1",
                "response_format": "verbose_json",
                "timestamp_granularities[]": "segment",
            }
            resp = await client.post(url, headers=headers, files=files, data=data)
            resp.raise_for_status()
            payload = resp.json()

    lang = (payload.get("language") or "en").strip().lower()
    segs = [
        TranscriptSegment(
            start_sec=round(float(s.get("start", 0.0)), 2),
            end_sec=round(float(s.get("end", 0.0)), 2),
            text=str(s.get("text", "")).strip(),
        )
        for s in payload.get("segments", [])
        if str(s.get("text", "")).strip()
    ]
    return TranscriptionResult(
        language=lang,
        language_name=language_name_for(lang),
        confidence=0.95,
        segments=_merge_short_segments(segs),
        provider="openai-whisper",
    )


@lru_cache(maxsize=1)
def _get_local_whisper_model():
    from faster_whisper import WhisperModel

    # 'base' + int8 runs fast on CPU with ~145MB download (cached locally after first run)
    return WhisperModel("base", device="cpu", compute_type="int8")


def _load_audio_array(audio_path: Path):
    """Decode audio to 16 kHz mono float32 via FFmpeg (avoids PyAV version incompatibilities)."""
    import subprocess

    import numpy as np

    from app.config import get_ffmpeg_binary

    proc = subprocess.run(
        [
            get_ffmpeg_binary(),
            "-nostdin",
            "-i",
            str(audio_path),
            "-f",
            "s16le",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-",
        ],
        capture_output=True,
        check=True,
    )
    return np.frombuffer(proc.stdout, np.int16).astype(np.float32) / 32768.0


def _transcribe_with_local_whisper(audio_path: Path) -> TranscriptionResult:
    model = _get_local_whisper_model()
    audio_array = _load_audio_array(audio_path)

    def _run(use_vad: bool):
        raw_segments, info = model.transcribe(
            audio_array,
            beam_size=1,
            vad_filter=use_vad,
        )
        segs: list[TranscriptSegment] = []
        for s in raw_segments:
            txt = (s.text or "").strip()
            if not txt:
                continue
            segs.append(
                TranscriptSegment(
                    start_sec=round(float(s.start), 2),
                    end_sec=round(float(s.end), 2),
                    text=txt,
                )
            )
        return segs, info

    segs, info = _run(use_vad=True)
    if not segs:
        # Retry without VAD for trailers/clips with music or soft dialogue
        segs, info = _run(use_vad=False)

    lang = (getattr(info, "language", "") or "en").strip().lower()
    prob = float(getattr(info, "language_probability", 0.9) or 0.9)
    return TranscriptionResult(
        language=lang,
        language_name=language_name_for(lang),
        confidence=round(prob, 2),
        segments=_merge_short_segments(segs),
        provider="faster-whisper-local",
    )


async def transcribe_audio(
    url: str,
    audio_path: Path,
    project_dir: Path,
    hint_language: str = "",
) -> TranscriptionResult:
    """
    Detect language and produce timestamped transcript with cost-saving priority:
    1. Free platform captions via yt-dlp (instant, $0) — skipped for local uploaded files
    2. Free local faster-whisper on CPU ($0, no API key needed)
    3. Cloud Gemini Audio / OpenAI Whisper fallback (if local fails & key is set)
    """
    settings = get_settings()
    errors: list[str] = []

    # 1. Free & instant: platform subtitles / auto-captions via yt-dlp (URL sources only)
    if url.startswith(("http://", "https://")):
        vtt_path, cap_lang = download_captions_vtt(url, project_dir, hint_language)
        if vtt_path:
            segs = parse_vtt_file(vtt_path)
            if segs:
                return TranscriptionResult(
                    language=cap_lang or "en",
                    language_name=language_name_for(cap_lang or "en"),
                    confidence=0.88,
                    segments=segs,
                    provider="platform-captions",
                )

    # 2. Free & local: faster-whisper (works offline with zero API cost)
    try:
        res = await asyncio.to_thread(_transcribe_with_local_whisper, audio_path)
        if res.segments:
            return res
        errors.append("local faster-whisper returned no speech segments")
    except Exception as exc:
        errors.append(f"local faster-whisper: {exc}")

    # 3. Cloud fallback: Gemini Audio if key is configured and audio fits inline (<18 MB)
    if settings.gemini_api_key and audio_path.stat().st_size <= 18 * 1024 * 1024:
        try:
            res = await _transcribe_with_gemini(audio_path)
            if res.segments:
                return res
            errors.append("Gemini returned no speech segments")
        except Exception as exc:
            errors.append(f"Gemini: {exc}")

    # 4. Cloud fallback: OpenAI Whisper if key is configured and audio <= 24 MB
    if settings.openai_api_key and audio_path.stat().st_size <= 24 * 1024 * 1024:
        try:
            res = await _transcribe_with_openai(audio_path)
            if res.segments:
                return res
            errors.append("OpenAI Whisper returned no speech segments")
        except Exception as exc:
            errors.append(f"OpenAI: {exc}")

    detail = "; ".join(errors) if errors else "no speech detected in audio"
    raise RuntimeError(f"Could not transcribe audio ({detail}).")

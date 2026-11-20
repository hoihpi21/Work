from __future__ import annotations

import json
from dataclasses import dataclass

import httpx

from app.config import get_settings


@dataclass
class TranslatedLine:
    index: int
    start_sec: float
    end_sec: float
    original_text: str
    burmese_text: str


RECAP_STYLE_PROMPTS: dict[str, str] = {
    "suspense": (
        "Write an engaging Burmese movie recap script in a suspenseful, gripping storytelling tone "
        "(like popular Myanmar YouTube movie recap channels). Hook the viewer immediately and keep "
        "sentences punchy, natural spoken Burmese (စကားပြောပုံစံ)."
    ),
    "funny": (
        "Write an entertaining, witty Burmese movie review/recap script with light humor and casual "
        "spoken Burmese expressions (စကားပြောပုံစံ) as if a charismatic reviewer is chatting with friends."
    ),
    "dramatic": (
        "Write an emotional, cinematic Burmese movie recap narration with expressive, warm spoken "
        "Burmese storytelling (စကားပြောပုံစံ)."
    ),
    "short60": (
        "Condense the story into a high-energy, fast-paced Burmese movie recap suitable for a "
        "60-second short video (TikTok/Reels/Shorts), with a strong opening hook and twist ending."
    ),
}


GEMINI_FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.5-flash"]


async def _call_gemini_json(prompt: str) -> dict:
    """Call Gemini with header auth; on busy/timeout errors quickly fall back to other models."""
    import asyncio

    settings = get_settings()
    headers = {"x-goog-api-key": settings.gemini_api_key}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.4},
    }
    models = [settings.gemini_model] + [m for m in GEMINI_FALLBACK_MODELS if m != settings.gemini_model]
    last_error = "unknown error"

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            for attempt in range(2):
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                except httpx.TimeoutException:
                    last_error = f"Gemini timeout ({model})"
                    break  # overloaded model: move to next model immediately
                if resp.status_code < 400:
                    data = resp.json()
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    return json.loads(text)
                last_error = f"Gemini HTTP {resp.status_code} ({model}): {resp.text[:200]}"
                if resp.status_code in (429, 500, 503) and attempt == 0:
                    await asyncio.sleep(2)
                    continue
                break
    raise RuntimeError(last_error)


async def _call_openai_json(prompt: str) -> dict:
    settings = get_settings()
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    payload = {
        "model": settings.openai_model,
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
        "messages": [
            {
                "role": "system",
                "content": "You are an expert Burmese (Myanmar) movie translator and recap scriptwriter. Always return valid JSON.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return json.loads(data["choices"][0]["message"]["content"])


async def _free_translate_to_burmese(text: str, source_lang: str = "auto") -> str:
    """Free fallback translation into Burmese Unicode when no LLM API key is set."""
    if not text.strip():
        return ""
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": source_lang or "auto",
        "tl": "my",
        "dt": "t",
        "q": text,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    parts = [item[0] for item in data[0] if item and item[0]]
    return "".join(parts).strip()


async def generate_burmese_script(
    segments: list[dict],
    source_language: str,
    title: str,
    mode: str = "recap",
    recap_style: str = "suspense",
) -> list[TranslatedLine]:
    """Translate transcript into Burmese (literal dubbing) or rewrite as a Burmese movie recap/review."""
    settings = get_settings()
    if not segments:
        return []

    if mode == "recap":
        style_desc = RECAP_STYLE_PROMPTS.get(recap_style, RECAP_STYLE_PROMPTS["suspense"])
        instruction = (
            f"Movie/Video Title: {title}\n"
            f"Source Language: {source_language}\n"
            f"Task: {style_desc}\n"
            "Rewrite the transcript segments below into timed Burmese (Myanmar Unicode) narration beats "
            "that follow the scenes of the video so the Burmese voice-over can replace the original audio. "
            "Keep each beat concise so it fits naturally within its start_sec..end_sec window.\n"
        )
    else:
        instruction = (
            f"Movie/Video Title: {title}\n"
            f"Source Language: {source_language}\n"
            "Task: Translate each segment faithfully into natural spoken Burmese (Myanmar Unicode) "
            "for voice-over dubbing, keeping the same segment count, indices, and timing.\n"
        )

    prompt = (
        f"{instruction}\n"
        "Return STRICT JSON ONLY:\n"
        '{"segments": [{"index": 0, "start_sec": 0.0, "end_sec": 5.0, "original_text": "...", "burmese_text": "..."}]}\n\n'
        f"Input segments:\n{json.dumps(segments, ensure_ascii=False)}"
    )

    if settings.gemini_api_key:
        try:
            parsed = await _call_gemini_json(prompt)
            out = _normalize_llm_segments(parsed.get("segments", []), segments)
            if out:
                return out
        except Exception:
            pass

    if settings.openai_api_key:
        try:
            parsed = await _call_openai_json(prompt)
            out = _normalize_llm_segments(parsed.get("segments", []), segments)
            if out:
                return out
        except Exception:
            pass

    # Fallback: segment-by-segment free Burmese translation (works out of the box without API keys)
    results: list[TranslatedLine] = []
    for idx, seg in enumerate(segments):
        orig = str(seg.get("original_text") or seg.get("text") or "").strip()
        try:
            my_text = await _free_translate_to_burmese(orig, source_language or "auto")
        except Exception:
            my_text = orig
        results.append(
            TranslatedLine(
                index=idx,
                start_sec=float(seg.get("start_sec", 0.0)),
                end_sec=float(seg.get("end_sec", 0.0)),
                original_text=orig,
                burmese_text=my_text,
            )
        )
    return results


def _normalize_llm_segments(raw_list: list[dict], fallback_input: list[dict]) -> list[TranslatedLine]:
    out: list[TranslatedLine] = []
    for i, item in enumerate(raw_list):
        burmese = str(item.get("burmese_text", "")).strip()
        if not burmese:
            continue
        fb = fallback_input[i] if i < len(fallback_input) else {}
        out.append(
            TranslatedLine(
                index=i,
                start_sec=float(item.get("start_sec", fb.get("start_sec", 0.0))),
                end_sec=float(item.get("end_sec", fb.get("end_sec", 0.0))),
                original_text=str(
                    item.get("original_text", fb.get("original_text", fb.get("text", "")))
                ).strip(),
                burmese_text=burmese,
            )
        )
    return out

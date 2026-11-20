from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

import edge_tts

from app.config import get_ffmpeg_binary, get_settings


@dataclass(frozen=True)
class VoiceStylePreset:
    id: str
    name: str
    prompt: str


VOICE_STYLE_PRESETS: list[VoiceStylePreset] = [
    VoiceStylePreset(
        id="whisper",
        name="Whisper",
        prompt="whisper quietly",
    ),
    VoiceStylePreset(
        id="friendly",
        name="Friendly",
        prompt="Warm and neutral delivery with micro-pauses",
    ),
    VoiceStylePreset(
        id="narration",
        name="Narration",
        prompt="commanding, rich vocal modulation, dramatic pauses",
    ),
    VoiceStylePreset(
        id="promote",
        name="Promote",
        prompt="High energy, elongated vowels",
    ),
    VoiceStylePreset(
        id="suspense",
        name="Suspense",
        prompt="Tense, mysterious movie recap pacing with low tone",
    ),
    VoiceStylePreset(
        id="emotional",
        name="Emotional",
        prompt="Gentle, heartfelt cinematic storytelling",
    ),
]


@dataclass(frozen=True)
class VoicePersona:
    id: str
    name: str
    burmese_label: str
    gender: str  # male | female | neutral
    age_group: str  # young | adult | senior
    pitch_label: str  # Low pitch | Medium-low pitch | Medium pitch | High pitch | Very high pitch
    use_case: str  # Tutor | Commercial Voiceover | Movie Recap | Storytelling & Drama | Review & Commentary
    style: str
    description: str
    provider: str
    edge_voice: str
    base_rate_pct: int
    base_pitch_hz: int
    ffmpeg_filter: str
    sample_text: str
    language: str = "Burmese (မြန်မာ)"


BUILTIN_VOICE_CATALOG: list[VoicePersona] = [
    # Featured voices matching the Speaker Settings UI design
    VoicePersona(
        id="riko",
        name="Riko",
        burmese_label="ရီကို (သွက်လက် ကြည်လင်)",
        gender="female",
        age_group="young",
        pitch_label="Medium pitch",
        use_case="Movie Recap",
        style="Clear and expressive.",
        description="Clear, expressive narrator ideal for modern movie recaps and reviews.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=4,
        base_pitch_hz=6,
        ffmpeg_filter="equalizer=f=3200:t=q:w=1.4:g=2,dynaudnorm",
        sample_text="မင်္ဂလာပါရှင်၊ ဒီနေ့တော့ ပရိသတ်တွေ အရမ်းကြိုက်ကြမယ့် ရုပ်ရှင်ဇာတ်ကားကောင်းတစ်ကားကို တင်ဆက်ပေးသွားမှာပါ။",
    ),
    VoicePersona(
        id="bodi",
        name="Bodi",
        burmese_label="ဘိုဒီ (တည်ငြိမ် အသံနိမ့်)",
        gender="male",
        age_group="adult",
        pitch_label="Low pitch",
        use_case="Tutor",
        style="Quiet and intimate.",
        description="Quiet and intimate delivery with a calm low pitch for thoughtful analysis.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=-8,
        base_pitch_hz=-14,
        ffmpeg_filter="lowpass=f=5200,bass=g=3:f=130,dynaudnorm",
        sample_text="မင်္ဂလာပါ၊ ဒီဇာတ်ကားရဲ့ အဓိက ဆိုလိုရင်းနဲ့ နက်နဲတဲ့ အချက်အလက်တွေကို အတူတူ လေ့လာကြည့်ကြရအောင်။",
    ),
    VoicePersona(
        id="lumi",
        name="Lumi",
        burmese_label="လူမီ (နွေးထွေး ရင်းနှီး)",
        gender="female",
        age_group="adult",
        pitch_label="Low pitch",
        use_case="Tutor",
        style="Warm and approachable.",
        description="Warm and approachable voice with smooth pacing for explanations and reviews.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=-4,
        base_pitch_hz=-10,
        ffmpeg_filter="equalizer=f=240:t=q:w=1.2:g=2.5,dynaudnorm",
        sample_text="မင်္ဂလာပါရှင်၊ ဒီဇာတ်လမ်းလေးထဲက စိတ်ဝင်စားစရာ အကြောင်းအရာလေးတွေကို နားလည်လွယ်အောင် ပြောပြပေးသွားပါမယ်။",
    ),
    VoicePersona(
        id="sola",
        name="Sola",
        burmese_label="ဆိုလာ (နူးညံ့ အသံမြင့်)",
        gender="female",
        age_group="young",
        pitch_label="Very high pitch",
        use_case="Tutor",
        style="Gentle and relaxed.",
        description="Gentle and relaxed voice with a bright high pitch.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=-2,
        base_pitch_hz=22,
        ffmpeg_filter="treble=g=3:f=4200,dynaudnorm",
        sample_text="မင်္ဂလာပါရှင်၊ အေးအေးဆေးဆေး နားထောင်လို့ကောင်းမယ့် ဇာတ်လမ်းလေးတစ်ပုဒ်ကို ပြောပြပေးချင်ပါတယ်။",
    ),
    VoicePersona(
        id="koda",
        name="Koda",
        burmese_label="ကိုဒါ (တိကျ ပြတ်သား)",
        gender="male",
        age_group="adult",
        pitch_label="Medium-low pitch",
        use_case="Commercial Voiceover",
        style="Direct and helpful.",
        description="Direct, punchy medium-low pitch voice ideal for trailers and promos.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=4,
        base_pitch_hz=-8,
        ffmpeg_filter="equalizer=f=180:t=q:w=1.2:g=2.5,equalizer=f=2800:t=q:w=1.4:g=2,dynaudnorm",
        sample_text="ဒီနှစ်အတွက် အကောင်းဆုံးနဲ့ စိတ်လှုပ်ရှားစရာ အကောင်းဆုံး ရုပ်ရှင်ဇာတ်ကားကြီးကို အခုပဲ ကြည့်ရှုလိုက်ပါ။",
    ),
    VoicePersona(
        id="milo",
        name="Milo",
        burmese_label="မိုင်လို (တက်ကြွ သွက်လက်)",
        gender="male",
        age_group="young",
        pitch_label="High pitch",
        use_case="Commercial Voiceover",
        style="Upbeat and persuasive.",
        description="Energetic commercial & short-form recap narrator that grabs attention fast.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=12,
        base_pitch_hz=12,
        ffmpeg_filter="treble=g=2.8:f=3600,dynaudnorm",
        sample_text="စက္ကန့်ပိုင်းအတွင်း ရင်ခုန်စိတ်လှုပ်ရှားသွားစေမယ့် ဇာတ်ကားကောင်းလေး လာပါပြီနော်။",
    ),
    # Core Burmese Movie Recap & Character Personas ( kept compatible with existing IDs )
    VoicePersona(
        id="adult-male-narrator",
        name="Thiha — Adult Male Narrator",
        burmese_label="သီဟ · လူကြီး အမျိုးသား ဇာတ်ကြောင်းပြော",
        gender="male",
        age_group="adult",
        pitch_label="Medium pitch",
        use_case="Movie Recap",
        style="Balanced and commanding.",
        description="Warm, confident Burmese male voice ideal for classic movie recaps and reviews.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=0,
        base_pitch_hz=0,
        ffmpeg_filter="equalizer=f=140:t=q:w=1.2:g=2,dynaudnorm",
        sample_text="မင်္ဂလာပါ၊ ဒီနေ့တော့ စိတ်လှုပ်ရှားစရာ ရုပ်ရှင်ဇာတ်ကားကောင်းတစ်ကားကို ပြန်လည်သုံးသပ်ပေးသွားမှာ ဖြစ်ပါတယ်။",
    ),
    VoicePersona(
        id="adult-female-narrator",
        name="Nilar — Adult Female Narrator",
        burmese_label="နီလာ · လူကြီး အမျိုးသမီး ဇာတ်ကြောင်းပြော",
        gender="female",
        age_group="adult",
        pitch_label="Medium pitch",
        use_case="Movie Recap",
        style="Warm and expressive.",
        description="Clear, expressive Burmese female narrator great for drama, romance, and detailed reviews.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=0,
        base_pitch_hz=0,
        ffmpeg_filter="equalizer=f=3000:t=q:w=1.5:g=1.5,dynaudnorm",
        sample_text="မင်္ဂလာပါ၊ ဒီဇာတ်ကားလေးကတော့ ကြည့်ရှုသူတိုင်းကို ရင်ထဲထိစေမယ့် ဇာတ်လမ်းကောင်းတစ်ပုဒ် ဖြစ်ပါတယ်။",
    ),
    VoicePersona(
        id="young-lady",
        name="May — Young Lady",
        burmese_label="မေ · လူငယ် အမျိုးသမီး (သွက်လက်)",
        gender="female",
        age_group="young",
        pitch_label="High pitch",
        use_case="Review & Commentary",
        style="Bright and energetic.",
        description="Lively, upbeat young woman's voice perfect for K-dramas, rom-coms, and TikTok recaps.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=10,
        base_pitch_hz=18,
        ffmpeg_filter="treble=g=3:f=4000,dynaudnorm",
        sample_text="ဟေး အားလုံးပဲ မင်္ဂလာပါရှင်၊ ဒီနေ့ပြောပြမယ့် ဇာတ်ကားကတော့ အရမ်းမိုက်ပြီး စိတ်ဝင်စားဖို့ကောင်းတယ်နော်။",
    ),
    VoicePersona(
        id="young-man-reviewer",
        name="Zayar — Young Man Reviewer",
        burmese_label="ဇေယျာ · လူငယ် အမျိုးသား (ရီဗျူး)",
        gender="male",
        age_group="young",
        pitch_label="High pitch",
        use_case="Review & Commentary",
        style="Casual and upbeat.",
        description="Fast-paced, energetic young male voice tailored for YouTube & Shorts movie reviewers.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=12,
        base_pitch_hz=14,
        ffmpeg_filter="treble=g=2.5:f=3500,dynaudnorm",
        sample_text="ဘော်ဒါတို့ရေ၊ ဒီဇာတ်ကားကို မကြည့်ရသေးရင် အခုပဲ ဇာတ်လမ်းအကျဉ်းလေး နားထောင်ကြည့်လိုက်ပါဦး။",
    ),
    VoicePersona(
        id="old-man-storyteller",
        name="U Ba — Old Man Storyteller",
        burmese_label="ဦးဘ · အဘိုးကြီး (ပုံပြောဆရာ)",
        gender="male",
        age_group="senior",
        pitch_label="Low pitch",
        use_case="Storytelling & Drama",
        style="Deep and wise.",
        description="Lower-pitched, unhurried elder male voice for historical epics, folklore, and mysteries.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=-12,
        base_pitch_hz=-20,
        ffmpeg_filter="lowpass=f=4800,bass=g=4:f=120,dynaudnorm",
        sample_text="ဟိုးရှေးရှေးတုန်းက စတင်ခဲ့တဲ့ ဒီဇာတ်လမ်းဟာ လူတိုင်းမေ့မရနိုင်တဲ့ သင်ခန်းစာတစ်ခု ဖြစ်လာခဲ့ပါတယ်။",
    ),
    VoicePersona(
        id="old-woman-grandmother",
        name="Daw Mya — Grandmother",
        burmese_label="ဒေါ်မြ · အဘွားကြီး (နူးညံ့)",
        gender="female",
        age_group="senior",
        pitch_label="Medium-low pitch",
        use_case="Storytelling & Drama",
        style="Gentle and warm.",
        description="Soft, calm elder female storytelling voice suited for emotional family dramas.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=-12,
        base_pitch_hz=-16,
        ffmpeg_filter="lowpass=f=5000,equalizer=f=250:t=q:w=1.2:g=2,dynaudnorm",
        sample_text="မြေးလေးတို့ရေ၊ ဒီဇာတ်လမ်းလေးကို နားထောင်ပြီးရင် မိသားစုမေတ္တာရဲ့ တန်ဖိုးကို ပိုနားလည်လာမှာပါ။",
    ),
    VoicePersona(
        id="cinematic-trailer-male",
        name="Kyaw — Cinematic Trailer Voice",
        burmese_label="ကျော် · ရုပ်ရှင် Trailer အသံဩဩ",
        gender="male",
        age_group="adult",
        pitch_label="Low pitch",
        use_case="Commercial Voiceover",
        style="Deep and dramatic.",
        description="Rich, booming trailer-style male voice for action, sci-fi, and thriller recaps.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=-6,
        base_pitch_hz=-24,
        ffmpeg_filter="bass=g=6:f=100,compand=attacks=0.05:decays=0.2:points=-80/-80|-20/-12|0/-2,dynaudnorm",
        sample_text="အမှောင်ထုထဲမှာ ဖုံးကွယ်ထားတဲ့ လျှို့ဝှက်ချက်တစ်ခု... သူတို့အားလုံးရဲ့ ကံကြမ္မာကို ပြောင်းလဲပစ်တော့မယ်။",
    ),
    VoicePersona(
        id="suspense-whisper",
        name="Hnin — Suspense / Whisper",
        burmese_label="နှင်း · သည်းထိတ်ရင်ဖို အသံတိုးတိုး",
        gender="neutral",
        age_group="adult",
        pitch_label="Medium-low pitch",
        use_case="Storytelling & Drama",
        style="Tense and atmospheric.",
        description="Hushed, eerie storytelling cadence for horror, crime, and plot-twist thrillers.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=-10,
        base_pitch_hz=-12,
        ffmpeg_filter="highpass=f=180,lowpass=f=4200,aecho=0.8:0.7:25:0.15,dynaudnorm",
        sample_text="ညသန်းခေါင်အချိန် တံခါးခေါက်သံကြားလိုက်ရတဲ့အခါ... အခန်းထဲမှာ ဘယ်သူမှ ရှိမနေခဲ့ပါဘူး။",
    ),
    VoicePersona(
        id="cheerful-anime-style",
        name="Su Su — Cheerful Youth / Anime",
        burmese_label="စုစု · ပျော်ရွှင်သွက်လက် လူငယ်",
        gender="female",
        age_group="young",
        pitch_label="Very high pitch",
        use_case="Review & Commentary",
        style="Playful and fast.",
        description="High-spirited playful voice made for anime recaps, comedies, and cartoons.",
        provider="edge-tts",
        edge_voice="my-MM-NilarNeural",
        base_rate_pct=15,
        base_pitch_hz=26,
        ffmpeg_filter="treble=g=4:f=4500,dynaudnorm",
        sample_text="ဝိုး... ဒီအန်နီမေးဇာတ်ကားထဲက ဇာတ်ကောင်လေးက အရမ်းချစ်ဖို့ကောင်းပြီး စွမ်းအားတွေလည်း အရမ်းမိုက်တယ်။",
    ),
    VoicePersona(
        id="documentary-host",
        name="Aung — Documentary Host",
        burmese_label="အောင် · မှတ်တမ်းရုပ်ရှင် တင်ဆက်သူ",
        gender="male",
        age_group="adult",
        pitch_label="Medium-low pitch",
        use_case="Tutor",
        style="Formal and authoritative.",
        description="Crisp broadcast-grade Burmese voice for documentaries, biographies, and film essays.",
        provider="edge-tts",
        edge_voice="my-MM-ThihaNeural",
        base_rate_pct=-4,
        base_pitch_hz=-6,
        ffmpeg_filter="highpass=f=80,equalizer=f=2500:t=q:w=1.4:g=2,dynaudnorm",
        sample_text="သမိုင်းဝင် အဖြစ်အပျက်မှန်ကို အခြေခံရိုက်ကူးထားတဲ့ ဒီဇာတ်ကားရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို လေ့လာကြည့်ကြရအောင်။",
    ),
]


def _custom_voices_file() -> Path:
    return get_settings().storage_path / "custom_voices.json"


def _load_custom_voices() -> list[VoicePersona]:
    path = _custom_voices_file()
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return [VoicePersona(**item) for item in raw]
    except Exception:
        return []


def get_all_voices() -> list[VoicePersona]:
    return BUILTIN_VOICE_CATALOG + _load_custom_voices()


def get_voice_by_id_map() -> dict[str, VoicePersona]:
    return {v.id: v for v in get_all_voices()}


# Backwards-compatible aliases used by existing routes/tests
VOICE_CATALOG = BUILTIN_VOICE_CATALOG
VOICE_BY_ID = {v.id: v for v in BUILTIN_VOICE_CATALOG}


def get_voice_persona(voice_id: str) -> VoicePersona:
    all_map = get_voice_by_id_map()
    return all_map.get(voice_id, BUILTIN_VOICE_CATALOG[0])


def register_custom_voice(
    *,
    name: str,
    burmese_label: str,
    gender: str,
    age_group: str,
    pitch_label: str,
    use_case: str,
    style: str,
    style_prompt: str = "",
) -> VoicePersona:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "voice"
    uid = f"custom-{slug}-{hashlib.md5(name.encode('utf-8')).hexdigest()[:6]}"
    edge_voice = "my-MM-ThihaNeural" if gender == "male" else "my-MM-NilarNeural"

    pitch_map = {
        "Low pitch": -18,
        "Medium-low pitch": -9,
        "Medium pitch": 0,
        "High pitch": 14,
        "Very high pitch": 24,
    }
    base_pitch_hz = pitch_map.get(pitch_label, 0)
    rate_delta, pitch_delta, extra_filter = _parse_style_prompt(style_prompt or style)
    ff_filter = f"{extra_filter},dynaudnorm" if extra_filter else "dynaudnorm"

    persona = VoicePersona(
        id=uid,
        name=name.strip(),
        burmese_label=burmese_label.strip() or f"{name.strip()} (စိတ်ကြိုက်)",
        gender=gender,
        age_group=age_group,
        pitch_label=pitch_label,
        use_case=use_case.strip() or "Movie Recap",
        style=style.strip() or "Custom voice style.",
        description=style_prompt.strip() or style.strip() or "Custom Burmese voice persona.",
        provider="edge-tts",
        edge_voice=edge_voice,
        base_rate_pct=rate_delta,
        base_pitch_hz=base_pitch_hz + pitch_delta,
        ffmpeg_filter=ff_filter,
        sample_text="မင်္ဂလာပါ၊ ဒါကတော့ သင်စိတ်ကြိုက် ဖန်တီးထားတဲ့ မြန်မာ နောက်ခံစကားပြော အသံဖြစ်ပါတယ်။",
    )

    customs = [v for v in _load_custom_voices() if v.id != persona.id]
    customs.append(persona)
    _custom_voices_file().write_text(
        json.dumps([asdict(v) for v in customs], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    VOICE_BY_ID[persona.id] = persona
    return persona


def _parse_style_prompt(style_prompt: str) -> tuple[int, int, str]:
    """
    Translate free-text voice style descriptions (like 'whisper quietly',
    'Warm and neutral delivery with micro-pauses', 'commanding, rich vocal modulation',
    'High energy, elongated vowels') into rate %, pitch Hz, and FFmpeg acoustic filters.
    """
    if not style_prompt or not style_prompt.strip():
        return 0, 0, ""

    p = style_prompt.lower()
    rate_delta = 0
    pitch_delta = 0
    filters: list[str] = []

    if any(k in p for k in ("whisper", "quiet", "hushed", "soft", "တိုးတိုး")):
        rate_delta -= 10
        pitch_delta -= 8
        filters.append("highpass=f=220,lowpass=f=3800,volume=0.85")
    if any(k in p for k in ("friendly", "warm", "neutral", "micro-pause", "approachable", "နွေးထွေး")):
        rate_delta -= 3
        filters.append("equalizer=f=260:t=q:w=1.2:g=2.5,equalizer=f=3200:t=q:w=1.5:g=1.5")
    if any(k in p for k in ("narration", "commanding", "rich", "dramatic", "modulation", "trailer")):
        rate_delta -= 5
        pitch_delta -= 10
        filters.append("bass=g=4:f=120,compand=attacks=0.05:decays=0.2:points=-80/-80|-20/-12|0/-2")
    if any(k in p for k in ("promote", "high energy", "energetic", "upbeat", "fast", "elongated", "သွက်လက်")):
        rate_delta += 12
        pitch_delta += 8
        filters.append("treble=g=3:f=3800")
    if any(k in p for k in ("slow", "calm", "relaxed", "deliberate", "ဖြည်းဖြည်း")):
        rate_delta -= 10
    if any(k in p for k in ("deep", "low", "bass", "အသံဩ")):
        pitch_delta -= 12
        filters.append("bass=g=3.5:f=115")
    if any(k in p for k in ("bright", "high pitch", "youth", "cheerful")):
        pitch_delta += 12
        filters.append("treble=g=2.5:f=4200")

    return rate_delta, pitch_delta, ",".join(filters)


def _format_rate(total_speed_multiplier: float, base_rate_pct: int) -> str:
    pct = int(round((total_speed_multiplier - 1.0) * 100)) + base_rate_pct
    pct = max(-45, min(60, pct))
    return f"{pct:+d}%"


def _format_pitch(user_pitch_semitones: int, base_pitch_hz: int) -> str:
    hz = base_pitch_hz + user_pitch_semitones * 6
    hz = max(-50, min(50, hz))
    return f"{hz:+d}Hz"


async def synthesize_burmese_speech(
    text: str,
    out_mp3_path: Path,
    voice_id: str = "riko",
    speed: float = 1.0,
    pitch: int = 0,
    style_prompt: str = "",
) -> Path:
    """Synthesize Burmese text using the chosen voice persona, style prompt, and acoustic shaping."""
    persona = get_voice_persona(voice_id)
    out_mp3_path.parent.mkdir(parents=True, exist_ok=True)
    raw_mp3 = out_mp3_path.with_suffix(".raw.mp3")

    prompt_rate, prompt_pitch, prompt_filter = _parse_style_prompt(style_prompt)
    rate_str = _format_rate(speed, persona.base_rate_pct + prompt_rate)
    pitch_str = _format_pitch(pitch, persona.base_pitch_hz + prompt_pitch)

    communicate = edge_tts.Communicate(
        text=text.strip(),
        voice=persona.edge_voice,
        rate=rate_str,
        pitch=pitch_str,
    )
    await communicate.save(str(raw_mp3))

    filter_chain = persona.ffmpeg_filter
    if prompt_filter:
        filter_chain = f"{ prompt_filter },{ filter_chain }"

    ffmpeg_bin = get_ffmpeg_binary()
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-i",
            str(raw_mp3),
            "-af",
            filter_chain,
            "-ar",
            "44100",
            "-ac",
            "2",
            "-b:a",
            "128k",
            str(out_mp3_path),
        ],
        check=True,
        capture_output=True,
    )
    raw_mp3.unlink(missing_ok=True)
    return out_mp3_path


async def get_or_create_voice_preview(voice_id: str, style_prompt: str = "") -> Path:
    """Generate and cache a Burmese sample clip for a voice persona (and optional style prompt)."""
    settings = get_settings()
    persona = get_voice_persona(voice_id)
    previews_dir = settings.storage_path / "voice_previews"
    previews_dir.mkdir(parents=True, exist_ok=True)

    if style_prompt.strip():
        digest = hashlib.md5(style_prompt.strip().lower().encode("utf-8")).hexdigest()[:8]
        preview_file = previews_dir / f"{persona.id}_{digest}.mp3"
    else:
        preview_file = previews_dir / f"{persona.id}.mp3"

    if not preview_file.exists() or preview_file.stat().st_size == 0:
        await synthesize_burmese_speech(
            text=persona.sample_text,
            out_mp3_path=preview_file,
            voice_id=persona.id,
            speed=1.0,
            pitch=0,
            style_prompt=style_prompt,
        )
    return preview_file

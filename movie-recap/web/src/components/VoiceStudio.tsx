import { useMemo, useRef, useState } from "react";
import {
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api } from "../api/client";
import type { VoicePersona, VoiceStylePreset } from "../types";

interface Props {
  voices: VoicePersona[];
  stylePresets: VoiceStylePreset[];
  selectedVoiceId: string;
  onSelectVoice: (id: string) => void;
  stylePrompt: string;
  onStylePromptChange: (v: string) => void;
  speed: number;
  onSpeedChange: (v: number) => void;
  pitch: number;
  onPitchChange: (v: number) => void;
  originalAudioVolume: number;
  onOriginalAudioVolumeChange: (v: number) => void;
  burnSubtitles: boolean;
  onBurnSubtitlesChange: (v: boolean) => void;
  busy: boolean;
  onRender: () => void;
  onVoiceCreated: (voice: VoicePersona) => void;
}

const PITCH_OPTIONS = [
  "all",
  "Low pitch",
  "Medium-low pitch",
  "Medium pitch",
  "High pitch",
  "Very high pitch",
] as const;

const USE_CASE_ORDER = [
  "Tutor",
  "Commercial Voiceover",
  "Movie Recap",
  "Storytelling & Drama",
  "Review & Commentary",
];

export function VoiceStudio({
  voices,
  stylePresets,
  selectedVoiceId,
  onSelectVoice,
  stylePrompt,
  onStylePromptChange,
  speed,
  onSpeedChange,
  pitch,
  onPitchChange,
  originalAudioVolume,
  onOriginalAudioVolumeChange,
  burnSubtitles,
  onBurnSubtitlesChange,
  busy,
  onRender,
  onVoiceCreated,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [pitchFilter, setPitchFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [useCaseFilter, setUseCaseFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // "+ New voice" creation modal state
  const [showNewVoiceModal, setShowNewVoiceModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBurmeseLabel, setNewBurmeseLabel] = useState("");
  const [newGender, setNewGender] = useState<"male" | "female" | "neutral">("female");
  const [newAge, setNewAge] = useState<"young" | "adult" | "senior">("adult");
  const [newPitchLabel, setNewPitchLabel] = useState<
    "Low pitch" | "Medium-low pitch" | "Medium pitch" | "High pitch" | "Very high pitch"
  >("Medium pitch");
  const [newUseCase, setNewUseCase] = useState("Movie Recap");
  const [newStyle, setNewStyle] = useState("Warm and approachable.");
  const [creatingVoice, setCreatingVoice] = useState(false);

  const currentVoice = useMemo(
    () => voices.find((v) => v.id === selectedVoiceId) || voices[0],
    [voices, selectedVoiceId]
  );

  const uniqueStyles = useMemo(() => {
    const s = new Set<string>();
    for (const v of voices) s.add(v.style);
    return Array.from(s);
  }, [voices]);

  const uniqueUseCases = useMemo(() => {
    const s = new Set<string>(USE_CASE_ORDER);
    for (const v of voices) s.add(v.use_case || "Movie Recap");
    return Array.from(s);
  }, [voices]);

  const filteredVoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return voices.filter((v) => {
      if (languageFilter !== "all" && v.language !== languageFilter) return false;
      if (genderFilter !== "all" && v.gender !== genderFilter) return false;
      if (pitchFilter !== "all" && v.pitch_label !== pitchFilter) return false;
      if (styleFilter !== "all" && v.style !== styleFilter) return false;
      if (useCaseFilter !== "all" && v.use_case !== useCaseFilter) return false;
      if (q) {
        const hay = `${v.name} ${v.burmese_label} ${v.style} ${v.description} ${v.pitch_label} ${v.use_case}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    voices,
    searchQuery,
    languageFilter,
    genderFilter,
    pitchFilter,
    styleFilter,
    useCaseFilter,
  ]);

  const groupedVoices = useMemo(() => {
    const map = new Map<string, VoicePersona[]>();
    for (const uc of uniqueUseCases) map.set(uc, []);
    for (const v of filteredVoices) {
      const key = v.use_case || "Movie Recap";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [filteredVoices, uniqueUseCases]);

  const togglePreview = (voice: VoicePersona, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const key = `${voice.id}:${stylePrompt.trim()}`;
    if (playingKey === key) {
      audioRef.current?.pause();
      setPlayingKey(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(api.voicePreviewUrl(voice, stylePrompt));
    audioRef.current = audio;
    setPlayingKey(key);
    audio.onended = () => setPlayingKey(null);
    audio.onerror = () => setPlayingKey(null);
    audio.play().catch(() => setPlayingKey(null));
  };

  const handleCreateCustomVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreatingVoice(true);
    try {
      const created = await api.createCustomVoice({
        name: newName.trim(),
        burmese_label: newBurmeseLabel.trim() || `${newName.trim()} (စိတ်ကြိုက်)`,
        gender: newGender,
        age_group: newAge,
        pitch_label: newPitchLabel,
        use_case: newUseCase,
        style: newStyle,
        style_prompt: stylePrompt,
      });
      onVoiceCreated(created);
      onSelectVoice(created.id);
      setShowNewVoiceModal(false);
      setNewName("");
      setNewBurmeseLabel("");
    } finally {
      setCreatingVoice(false);
    }
  };

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 16 }}>
        <div>
          <h2>Speaker Settings & Voice-Over Style</h2>
          <p className="muted">
            Select a speaker, customize the delivery style (Whisper, Friendly, Narration, Promote, etc.), and replace the original video voice.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onRender}
        >
          <Sparkles size={16} />
          {busy ? "Rendering..." : "Replace Voice & Render Video"}
        </button>
      </div>

      <div className="speaker-studio-layout">
        {/* LEFT PANEL: Speaker Settings (matches Photo 2) */}
        <div className="speaker-panel">
          <p className="panel-eyebrow">VOICE</p>

          {currentVoice && (
            <div className="current-voice-card">
              <div>
                <div className="current-voice-label">Current voice</div>
                <div className="current-voice-name">{currentVoice.name}</div>
                <div className="my-text" style={{ fontSize: "0.83rem", color: "#fcd34d" }}>
                  {currentVoice.burmese_label} · {currentVoice.pitch_label}
                </div>
              </div>
              <button
                type="button"
                className={`circle-play-btn ${
                  playingKey === `${currentVoice.id}:${stylePrompt.trim()}` ? "playing" : ""
                }`}
                title="Preview current voice"
                onClick={(e) => togglePreview(currentVoice, e)}
              >
                {playingKey === `${currentVoice.id}:${stylePrompt.trim()}` ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} />
                )}
              </button>
            </div>
          )}

          {/* Search + New Voice button */}
          <div className="search-voice-row">
            <div className="search-input-wrap">
              <Search size={16} />
              <input
                type="text"
                placeholder={`Search ${voices.length}+ voices...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="new-voice-btn"
              onClick={() => setShowNewVoiceModal((v) => !v)}
            >
              {showNewVoiceModal ? <X size={15} /> : <Plus size={15} />}
              New voice
            </button>
          </div>

          {/* "+ New voice" inline creation form */}
          {showNewVoiceModal && (
            <form
              onSubmit={handleCreateCustomVoice}
              style={{
                padding: 14,
                borderRadius: 12,
                background: "var(--surface)",
                border: "1px solid var(--accent)",
                marginBottom: 14,
              }}
            >
              <div className="between" style={{ marginBottom: 10 }}>
                <strong>Create Custom Voice Persona</strong>
                <button
                  type="button"
                  className="view-all-btn"
                  onClick={() => setShowNewVoiceModal(false)}
                >
                  Close
                </button>
              </div>
              <div className="row" style={{ marginBottom: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Voice name (e.g. Riko, Ko Aung)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Burmese label (optional)"
                  value={newBurmeseLabel}
                  onChange={(e) => setNewBurmeseLabel(e.target.value)}
                />
              </div>
              <div className="row" style={{ marginBottom: 8 }}>
                <select
                  className="filter-select"
                  value={newGender}
                  onChange={(e) =>
                    setNewGender(e.target.value as "male" | "female" | "neutral")
                  }
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="neutral">Neutral</option>
                </select>
                <select
                  className="filter-select"
                  value={newAge}
                  onChange={(e) =>
                    setNewAge(e.target.value as "young" | "adult" | "senior")
                  }
                >
                  <option value="young">Young</option>
                  <option value="adult">Adult</option>
                  <option value="senior">Senior</option>
                </select>
                <select
                  className="filter-select"
                  value={newPitchLabel}
                  onChange={(e) =>
                    setNewPitchLabel(e.target.value as typeof newPitchLabel)
                  }
                >
                  {PITCH_OPTIONS.filter((p) => p !== "all").map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  className="filter-select"
                  value={newUseCase}
                  onChange={(e) => setNewUseCase(e.target.value)}
                >
                  {USE_CASE_ORDER.map((uc) => (
                    <option key={uc} value={uc}>
                      {uc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row">
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Short trait (e.g. Quiet and intimate.)"
                  value={newStyle}
                  onChange={(e) => setNewStyle(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingVoice}
                >
                  <Plus size={15} />
                  {creatingVoice ? "Saving..." : "Save Voice"}
                </button>
              </div>
            </form>
          )}

          {/* Filter Dropdown Pills: Language, Gender, Pitch, Style, Use case */}
          <div className="filter-pills-row">
            <select
              className="filter-select"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              aria-label="Filter by language"
            >
              <option value="all">Language: All</option>
              <option value="Burmese (မြန်မာ)">Burmese (မြန်မာ)</option>
            </select>

            <select
              className="filter-select"
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              aria-label="Filter by gender"
            >
              <option value="all">Gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="neutral">Neutral</option>
            </select>

            <select
              className="filter-select"
              value={pitchFilter}
              onChange={(e) => setPitchFilter(e.target.value)}
              aria-label="Filter by pitch"
            >
              <option value="all">Pitch</option>
              {PITCH_OPTIONS.filter((p) => p !== "all").map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={styleFilter}
              onChange={(e) => setStyleFilter(e.target.value)}
              aria-label="Filter by style"
            >
              <option value="all">Style</option>
              {uniqueStyles.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={useCaseFilter}
              onChange={(e) => setUseCaseFilter(e.target.value)}
              aria-label="Filter by use case"
            >
              <option value="all">Use case</option>
              {uniqueUseCases.map((uc) => (
                <option key={uc} value={uc}>
                  {uc}
                </option>
              ))}
            </select>
          </div>

          {/* Categorized Speaker List by Use Case */}
          <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
            {groupedVoices.map(([groupName, groupList]) => {
              const isExpanded = expandedGroups[groupName] ?? true;
              const visibleList = isExpanded ? groupList : groupList.slice(0, 3);
              return (
                <div key={groupName} className="usecase-group">
                  <div className="usecase-header">
                    <h3 className="usecase-title">{groupName}</h3>
                    {groupList.length > 3 && (
                      <button
                        type="button"
                        className="view-all-btn"
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [groupName]: !isExpanded,
                          }))
                        }
                      >
                        {isExpanded ? "Show less" : `View all ${groupList.length}`}
                      </button>
                    )}
                  </div>

                  {visibleList.map((voice) => {
                    const selected = voice.id === selectedVoiceId;
                    const playKey = `${voice.id}:${stylePrompt.trim()}`;
                    const isPlaying = playingKey === playKey;
                    return (
                      <div
                        key={voice.id}
                        className={`speaker-row ${selected ? "selected" : ""}`}
                        onClick={() => onSelectVoice(voice.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            onSelectVoice(voice.id);
                        }}
                      >
                        <div>
                          <div className="speaker-row-name">{voice.name}</div>
                          <div className="speaker-row-sub">
                            {voice.style} · {voice.pitch_label}
                          </div>
                          <div
                            className="my-text"
                            style={{ fontSize: "0.8rem", color: "#fcd34d" }}
                          >
                            {voice.burmese_label}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`circle-play-btn ${isPlaying ? "playing" : ""}`}
                          title={`Preview ${voice.name}`}
                          onClick={(e) => togglePreview(voice, e)}
                        >
                          {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL: Voice Style Prompt & Presets (matches Photo 1) */}
        <div className="style-panel">
          <p className="panel-eyebrow">VOICE STYLE & DELIVERY</p>
          <textarea
            className="style-prompt-box"
            placeholder={"Describe the voice style.\ne.g. Tone, mood, pace..."}
            value={stylePrompt}
            onChange={(e) => onStylePromptChange(e.target.value)}
          />

          <div className="style-preset-list">
            {stylePresets.map((preset) => {
              const isActive =
                stylePrompt.trim().toLowerCase() === preset.prompt.toLowerCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`style-preset-item ${isActive ? "active" : ""}`}
                  onClick={() =>
                    onStylePromptChange(isActive ? "" : preset.prompt)
                  }
                >
                  <div className="style-preset-title">{preset.name}</div>
                  <div className="style-preset-desc">{preset.prompt}</div>
                </button>
              );
            })}
          </div>

          {/* Fine-tune controls */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <div style={{ marginBottom: 12 }}>
              <label className="between">
                <span>Narration Speed</span>
                <strong>{speed.toFixed(2)}x</strong>
              </label>
              <input
                type="range"
                min={0.75}
                max={1.5}
                step={0.05}
                value={speed}
                onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="between">
                <span>Pitch Fine-Tune</span>
                <strong>{pitch > 0 ? `+${pitch}` : pitch} st</strong>
              </label>
              <input
                type="range"
                min={-6}
                max={6}
                step={1}
                value={pitch}
                onChange={(e) => onPitchChange(parseInt(e.target.value, 10))}
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="between">
                <span className="row" style={{ gap: 6 }}>
                  {originalAudioVolume === 0 ? (
                    <VolumeX size={15} />
                  ) : (
                    <Volume2 size={15} />
                  )}
                  Original Video Voice
                </span>
                <strong>
                  {originalAudioVolume === 0
                    ? "Replaced (0%)"
                    : `${Math.round(originalAudioVolume * 100)}% BG`}
                </strong>
              </label>
              <input
                type="range"
                min={0}
                max={0.25}
                step={0.05}
                value={originalAudioVolume}
                onChange={(e) =>
                  onOriginalAudioVolumeChange(parseFloat(e.target.value))
                }
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                id="burn-subs"
                type="checkbox"
                checked={burnSubtitles}
                onChange={(e) => onBurnSubtitlesChange(e.target.checked)}
              />
              <label
                htmlFor="burn-subs"
                style={{ cursor: "pointer", fontSize: "0.9rem" }}
              >
                Burn Burmese subtitles into MP4 video
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

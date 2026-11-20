import { useEffect, useMemo, useState } from "react";
import {
  ClipboardPaste,
  FileText,
  FileUp,
  Film,
  Globe,
  Languages,
  Link2,
  Loader2,
  Music,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "./api/client";
import { ExportPlayer } from "./components/ExportPlayer";
import { StepIndicator } from "./components/StepIndicator";
import { VoiceStudio } from "./components/VoiceStudio";
import type {
  JobEvent,
  Project,
  VoicePersona,
  VoiceStylePreset,
} from "./types";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const DEFAULT_STYLE_PRESETS: VoiceStylePreset[] = [
  { id: "whisper", name: "Whisper", prompt: "whisper quietly" },
  {
    id: "friendly",
    name: "Friendly",
    prompt: "Warm and neutral delivery with micro-pauses",
  },
  {
    id: "narration",
    name: "Narration",
    prompt: "commanding, rich vocal modulation, dramatic pauses",
  },
  { id: "promote", name: "Promote", prompt: "High energy, elongated vowels" },
  {
    id: "suspense",
    name: "Suspense",
    prompt: "Tense, mysterious movie recap pacing with low tone",
  },
  {
    id: "emotional",
    name: "Emotional",
    prompt: "Gentle, heartfelt cinematic storytelling",
  },
];

export function App() {
  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  const [urlInput, setUrlInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [voices, setVoices] = useState<VoicePersona[]>([]);
  const [stylePresets, setStylePresets] = useState<VoiceStylePreset[]>(
    DEFAULT_STYLE_PRESETS
  );
  const [step, setStep] = useState(1);

  const [mode, setMode] = useState<"literal" | "recap">("recap");
  const [recapStyle, setRecapStyle] = useState<
    "suspense" | "funny" | "dramatic" | "short60"
  >("suspense");
  const [editedBurmese, setEditedBurmese] = useState<Record<string, string>>({});

  // Transcript Import state (Copy/Paste or .srt / .vtt / .txt file)
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "file">("paste");
  const [importTarget, setImportTarget] = useState<"original" | "burmese">(
    "original"
  );
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importAudioFile, setImportAudioFile] = useState<File | null>(null);
  const [autoTranscribeAudio, setAutoTranscribeAudio] = useState(true);

  const [voiceId, setVoiceId] = useState("riko");
  const [stylePrompt, setStylePrompt] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [originalAudioVolume, setOriginalAudioVolume] = useState(0.0);
  const [burnSubtitles, setBurnSubtitles] = useState(false);

  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobEvent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listVoices().then(setVoices).catch(() => {});
    api.listStylePresets().then(setStylePresets).catch(() => {});
    api.listProjects().then(setProjects).catch(() => {});
  }, []);

  const syncProjectState = (p: Project) => {
    setProject(p);
    setMode(p.mode);
    setRecapStyle(p.recap_style);
    setVoiceId(p.voice_id || "riko");
    setStylePrompt(p.voice_style_prompt || "");
    setSpeed(p.voice_speed || 1.0);
    setPitch(p.voice_pitch || 0);
    setOriginalAudioVolume(p.original_audio_volume ?? 0.0);
    setBurnSubtitles(p.burn_subtitles || false);
    const map: Record<string, string> = {};
    for (const seg of p.segments) {
      map[seg.id] = seg.burmese_text;
    }
    setEditedBurmese(map);
  };

  const maxUnlockedStep = useMemo(() => {
    if (!project) return 1;
    if (project.has_dubbed_video) return 5;
    if (project.segments.some((s) => s.burmese_text.trim())) return 4;
    // Allow jumping to Step 3 even before Step 2 AI transcription so users can import SRT/TXT or copy/paste directly!
    return 3;
  }, [project]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setError("");
    setBusy(true);
    try {
      const p = await api.analyzeUrl(urlInput.trim());
      syncProjectState(p);
      setStep(2);
      api.listProjects().then(setProjects).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze URL");
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setError("");
    setBusy(true);
    try {
      const p = await api.uploadVideo(selectedFile, uploadTitle);
      syncProjectState(p);
      setStep(2);
      api.listProjects().then(setProjects).catch(() => {});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload video file"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTranscribe = async () => {
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const started = await api.startTranscribe(project.id);
      setJob(started);
      await api.watchJob(started.id, setJob);
      const updated = await api.getProject(project.id);
      syncProjectState(updated);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setBusy(false);
    }
  };

  const handleImportTranscript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      let updated: Project;
      if (importTab === "paste") {
        if (!importText.trim()) {
          throw new Error("Please paste transcript text or SRT content first.");
        }
        updated = await api.importTranscriptText(
          project.id,
          importText,
          importTarget,
          "auto"
        );
      } else {
        if (!importFile) {
          throw new Error("Please select an .srt, .vtt, or .txt file first.");
        }
        updated = await api.importTranscriptFile(
          project.id,
          importFile,
          importTarget
        );
      }
      syncProjectState(updated);
      setShowImportPanel(false);
      setImportText("");
      setImportFile(null);
      setStep(3);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import transcript"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTranslate = async () => {
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const started = await api.startTranslate(project.id, mode, recapStyle);
      setJob(started);
      await api.watchJob(started.id, setJob);
      const updated = await api.getProject(project.id);
      syncProjectState(updated);
      setStep(3);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Burmese translation failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const payload = project.segments.map((s) => ({
        id: s.id,
        burmese_text: editedBurmese[s.id] ?? s.burmese_text,
      }));
      const updated = await api.saveSegments(project.id, payload);
      syncProjectState(updated);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edits");
    } finally {
      setBusy(false);
    }
  };

  const handleRender = async () => {
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const started = await api.startRender(project.id, {
        voice_id: voiceId,
        voice_speed: speed,
        voice_pitch: pitch,
        voice_style_prompt: stylePrompt,
        original_audio_volume: originalAudioVolume,
        burn_subtitles: burnSubtitles,
      });
      setJob(started);
      await api.watchJob(started.id, setJob);
      const updated = await api.getProject(project.id);
      syncProjectState(updated);
      setStep(5);
      api.listProjects().then(setProjects).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rendering failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (project?.id === id) {
      setProject(null);
      setStep(1);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Film size={22} />
          </div>
          <div>
            <h1>CineRecap MM</h1>
            <p>
              Movie Recap & Review · Burmese Translation & Multi-Voice Video
              Dubbing
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setProject(null);
            setUrlInput("");
            setSelectedFile(null);
            setJob(null);
            setError("");
            setStep(1);
          }}
        >
          <Plus size={16} />
          New Video
        </button>
      </header>

      <StepIndicator
        currentStep={step}
        maxUnlockedStep={maxUnlockedStep}
        onSelect={setStep}
      />

      {error && <div className="error-banner">{error}</div>}

      {busy && job && (
        <div className="progress-box">
          <div className="between">
            <span className="row">
              <Loader2 size={16} className="spin" />
              <strong>{job.message}</strong>
            </span>
            <span>{job.progress}%</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* STEP 1: ANY VIDEO URL OR MANUAL VIDEO FILE UPLOAD */}
      {step === 1 && (
        <>
          <div className="card">
            <div className="between" style={{ marginBottom: 14 }}>
              <div>
                <h2>Add Video — Any Valid Video URL or Upload File</h2>
                <p className="muted">
                  Paste a video link from YouTube, TikTok, Facebook, Instagram,
                  Vimeo, Dailymotion, Bilibili, X/Twitter, or any direct
                  .mp4/.webm/.m3u8 URL — or upload an already-downloaded video.
                </p>
              </div>
              <div className="row">
                <button
                  type="button"
                  className={`chip ${inputMode === "url" ? "active" : ""}`}
                  onClick={() => setInputMode("url")}
                >
                  <Link2 size={13} style={{ marginRight: 5 }} />
                  Video URL
                </button>
                <button
                  type="button"
                  className={`chip ${inputMode === "upload" ? "active" : ""}`}
                  onClick={() => setInputMode("upload")}
                >
                  <Upload size={13} style={{ marginRight: 5 }} />
                  Upload Video / Audio File
                </button>
              </div>
            </div>

            {inputMode === "url" ? (
              <>
                <form
                  onSubmit={handleAnalyze}
                  className="row"
                  style={{ marginTop: 10 }}
                >
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 260 }}
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=... or TikTok / Vimeo / Facebook / direct .mp4 URL"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy}
                  >
                    <Link2 size={16} />
                    {busy ? "Analyzing..." : "Analyze Video URL"}
                  </button>
                </form>
                <div className="row" style={{ marginTop: 12, gap: 6 }}>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    Supported:
                  </span>
                  {[
                    "YouTube",
                    "TikTok",
                    "Facebook",
                    "Vimeo",
                    "Dailymotion",
                    "Bilibili",
                    "Instagram",
                    "X / Twitter",
                    "Direct MP4 / M3U8",
                  ].map((p) => (
                    <span key={p} className="badge" style={{ fontSize: "0.73rem" }}>
                      {p}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <form onSubmit={handleUploadFile} style={{ marginTop: 10 }}>
                <div className="row">
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 220 }}
                    type="text"
                    placeholder="Optional movie / video / audio title"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                  />
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 240 }}
                    type="file"
                    accept="video/*,audio/*,.mp4,.mov,.mkv,.webm,.avi,.m4v,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.wma"
                    onChange={(e) =>
                      setSelectedFile(e.target.files?.[0] || null)
                    }
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !selectedFile}
                  >
                    <Upload size={16} />
                    {busy ? "Uploading..." : "Upload File"}
                  </button>
                </div>
              </form>
            )}

            <p className="muted" style={{ marginTop: 12, fontSize: "0.8rem" }}>
              Please only process videos that you own or have permission to
              recap/transform.
            </p>
          </div>

          {projects.length > 0 && (
            <div className="card">
              <h2>Recent Projects</h2>
              <div className="recent-grid">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="recent-item"
                    onClick={() => {
                      syncProjectState(p);
                      setStep(
                        p.has_dubbed_video ? 5 : p.segments.length ? 3 : 2
                      );
                    }}
                  >
                    <div className="between">
                      <strong style={{ fontSize: "0.92rem" }}>
                        {p.title.slice(0, 48)}
                      </strong>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: "4px 7px" }}
                        onClick={(e) => handleDeleteProject(p.id, e)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <span className="badge">{p.platform}</span>
                      <span className="badge badge-accent">{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* STEP 2: VIDEO ANALYSIS & TRANSCRIPTION (OR JUMP TO STEP 3 IMPORT) */}
      {step === 2 && project && (
        <div className="card">
          <div className="between">
            <div>
              <h2>Video Analysis & Language Detection</h2>
              <p className="muted">
                Auto-detect the spoken language & transcribe with AI, or skip
                straight to Step 3 to copy/paste or upload an .srt / .txt
                transcript.
              </p>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setShowImportPanel(true);
                  setStep(3);
                }}
              >
                <FileUp size={16} />
                Import SRT / TXT Instead
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={handleTranscribe}
              >
                <Globe size={16} />
                Detect Language & Transcribe
              </button>
            </div>
          </div>

          <div className="video-meta">
            {project.thumbnail_url && (
              <img
                src={api.mediaUrl(project.thumbnail_url)}
                alt={project.title}
                className="video-thumb"
              />
            )}
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: "0 0 8px" }}>{project.title}</h3>
              <div className="row">
                <span className="badge">{project.platform}</span>
                {project.uploader && (
                  <span className="badge">{project.uploader}</span>
                )}
                <span className="badge">
                  Duration: {formatTime(project.duration_sec)}
                </span>
                <span className="badge badge-accent">
                  Language: {project.detected_language_name || "Pending"}
                  {project.language_confidence > 0
                    ? ` (${Math.round(project.language_confidence * 100)}%)`
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {project.has_source_video && project.source_video_url && (
            <video
              className="video-player"
              controls
              preload="metadata"
              playsInline
              src={api.mediaUrl(project.source_video_url, true)}
            />
          )}
        </div>
      )}

      {/* STEP 3: BURMESE TRANSLATION, RECAP SCRIPT & TRANSCRIPT IMPORT (COPY/PASTE OR SRT/TXT/RT) */}
      {step === 3 && project && (
        <div className="card">
          <div className="between">
            <div>
              <h2>Burmese Translation & Movie Recap Script</h2>
              <p className="muted">
                Detected language:{" "}
                <strong>{project.detected_language_name || "Auto"}</strong> ·
                Choose Literal Translation or Movie Recap / Review mode, upload
                a transcription file (<code>.txt</code>, <code>.srt</code>,{" "}
                <code>.rt</code>, <code>.vtt</code>) or copy/paste text below,
                then edit any Burmese line.
              </p>
            </div>
            <div className="row">
              {project.segments.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={handleTranslate}
                >
                  <Languages size={16} />
                  {project.segments.some((s) => s.burmese_text)
                    ? "Regenerate Burmese Script"
                    : "Generate Burmese Script"}
                </button>
              )}
              {project.segments.some((s) =>
                (editedBurmese[s.id] || s.burmese_text).trim()
              ) && (
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={busy}
                  onClick={handleSaveEdits}
                >
                  <Save size={16} />
                  Save & Choose Voice
                </button>
              )}
            </div>
          </div>

          <div className="row" style={{ marginTop: 14, marginBottom: 16 }}>
            <button
              type="button"
              className={`chip ${mode === "recap" ? "active" : ""}`}
              onClick={() => setMode("recap")}
            >
              <Sparkles size={13} style={{ marginRight: 4 }} />
              Movie Recap / Review Mode
            </button>
            <button
              type="button"
              className={`chip ${mode === "literal" ? "active" : ""}`}
              onClick={() => setMode("literal")}
            >
              Literal Dubbing Translation
            </button>

            {mode === "recap" && (
              <>
                <span className="muted" style={{ marginLeft: 10 }}>
                  Style:
                </span>
                {(
                  [
                    ["suspense", "Suspense Recap"],
                    ["funny", "Casual / Funny Review"],
                    ["dramatic", "Dramatic Storytelling"],
                    ["short60", "60s Short Hook"],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    className={`chip ${recapStyle === val ? "active" : ""}`}
                    onClick={() => setRecapStyle(val)}
                  >
                    {lbl}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* ALWAYS-VISIBLE IMPORT SECTION: 1. AUDIO FILE FOR SCRIPT  2. TRANSCRIPTION FILE (.TXT/.SRT/.RT)  3. COPY/PASTE */}
          <div className="import-drawer" style={{ marginBottom: 18 }}>
            <div className="between" style={{ marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: "0.98rem" }}>
                  Import Both: Audio File for Script & Transcription File (.txt, .srt, .rt, .vtt) to Translate Later
                </strong>
                <div className="muted" style={{ fontSize: "0.82rem", marginTop: 2 }}>
                  You can import an audio file (for script generation or reference playback) AND upload a transcription file (<code>.txt</code>, <code>.srt</code>, <code>.rt</code>) or copy/paste text to translate into Burmese later.
                </div>
              </div>
              <div className="row">
                <span className="muted" style={{ fontSize: "0.82rem" }}>
                  Import language:
                </span>
                <button
                  type="button"
                  className={`chip ${
                    importTarget === "original" ? "active" : ""
                  }`}
                  onClick={() => setImportTarget("original")}
                >
                  Original Language (Translate into Burmese Later)
                </button>
                <button
                  type="button"
                  className={`chip ${
                    importTarget === "burmese" ? "active" : ""
                  }`}
                  onClick={() => setImportTarget("burmese")}
                >
                  Already Burmese Script
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 14,
                alignItems: "stretch",
              }}
            >
              {/* BOX 1: IMPORT AUDIO FILE FOR SCRIPT (.mp3, .wav, .m4a, .aac, .ogg, .flac) */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px dashed var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Music size={16} />
                    1. Import Audio File (For Script)
                  </div>
                  <p className="muted" style={{ fontSize: "0.8rem", margin: "0 0 8px" }}>
                    Supports <code>.mp3</code>, <code>.wav</code>, <code>.m4a</code>,{" "}
                    <code>.aac</code>, <code>.ogg</code>, <code>.flac</code>,{" "}
                    <code>.opus</code>, <code>.wma</code>
                  </p>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: "0.8rem",
                      marginBottom: 10,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={autoTranscribeAudio}
                      onChange={(e) => setAutoTranscribeAudio(e.target.checked)}
                    />
                    <span>
                      Auto-extract script lines from audio (uncheck if using{" "}
                      <code>.srt</code> / <code>.txt</code> in Box 2)
                    </span>
                  </label>
                  <input
                    className="input"
                    type="file"
                    disabled={busy}
                    accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.wma,audio/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] || null;
                      setImportAudioFile(f);
                      if (f && project) {
                        setError("");
                        setBusy(true);
                        try {
                          const updated = await api.importAudioForScript(
                            project.id,
                            f,
                            autoTranscribeAudio,
                            importTarget
                          );
                          syncProjectState(updated);
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Failed to import audio file"
                          );
                        } finally {
                          setBusy(false);
                        }
                      }
                    }}
                  />
                </div>
                <div>
                  {importAudioFile && (
                    <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                      {busy ? "Processing audio: " : "Loaded audio: "}
                      <strong>{importAudioFile.name}</strong>
                    </div>
                  )}
                  {project.has_source_audio && project.source_audio_url && (
                    <audio
                      controls
                      preload="metadata"
                      src={`${api.mediaUrl(project.source_audio_url, true)}&t=${encodeURIComponent(project.updated_at)}`}
                      style={{ width: "100%", height: 34, marginTop: 10 }}
                    />
                  )}
                </div>
              </div>

              {/* BOX 2: UPLOAD TRANSCRIPTION FILE (.txt, .srt, .rt, .rtf, .vtt, .ass, .sub) TO TRANSLATE LATER */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px dashed var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <FileText size={16} />
                    2. Upload Transcription File (To Translate)
                  </div>
                  <p className="muted" style={{ fontSize: "0.8rem", margin: "0 0 10px" }}>
                    Upload <code>.txt</code>, <code>.srt</code>, <code>.rt</code>,{" "}
                    <code>.rtf</code>, <code>.vtt</code>, <code>.ass</code>,{" "}
                    <code>.ssa</code>, <code>.sub</code>, <code>.lrc</code> — then click{" "}
                    <strong>Generate Burmese Script</strong> whenever you're ready to translate.
                  </p>
                  <input
                    className="input"
                    type="file"
                    disabled={busy}
                    accept=".txt,.srt,.rt,.rtf,.vtt,.ass,.ssa,.sub,.lrc,.md,.csv,text/plain,application/x-subrip"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] || null;
                      setImportFile(f);
                      if (f && project) {
                        setError("");
                        setBusy(true);
                        try {
                          const updated = await api.importTranscriptFile(
                            project.id,
                            f,
                            importTarget
                          );
                          syncProjectState(updated);
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Failed to import transcription file"
                          );
                        } finally {
                          setBusy(false);
                        }
                      }
                    }}
                  />
                </div>
                {importFile && (
                  <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                    {busy ? "Loading transcript: " : "Loaded transcript: "}
                    <strong>{importFile.name}</strong>
                  </div>
                )}
              </div>

              {/* BOX 3: COPY / PASTE TRANSCRIPTION PLACE */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <ClipboardPaste size={16} />
                    3. Or Copy / Paste Transcription Here
                  </div>
                  <textarea
                    className="segment-textarea"
                    style={{ minHeight: 92, marginTop: 4 }}
                    placeholder={
                      "Paste plain text, [00:05] timestamped lines, RealText (.rt), or SRT subtitle blocks here to translate later..."
                    }
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                </div>
                <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || !importText.trim()}
                    onClick={async () => {
                      if (!project || !importText.trim()) return;
                      setError("");
                      setBusy(true);
                      try {
                        const updated = await api.importTranscriptText(
                          project.id,
                          importText,
                          importTarget,
                          "auto"
                        );
                        syncProjectState(updated);
                        setImportText("");
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Failed to import pasted text"
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <ClipboardPaste size={15} />
                    Load Pasted Text
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="segment-list">
            {project.segments.map((seg) => (
              <div key={seg.id} className="segment-item">
                <div className="between">
                  <span className="badge">
                    #{seg.index + 1} · {formatTime(seg.start_sec)} –{" "}
                    {formatTime(seg.end_sec)}
                  </span>
                </div>
                <p className="muted" style={{ margin: "8px 0 4px" }}>
                  {seg.original_text}
                </p>
                <textarea
                  className="segment-textarea"
                  placeholder="Burmese script (မြန်မာဘာသာ) will appear here..."
                  value={editedBurmese[seg.id] ?? seg.burmese_text}
                  onChange={(e) =>
                    setEditedBurmese((prev) => ({
                      ...prev,
                      [seg.id]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 4: SPEAKER SETTINGS & VOICE STYLE STUDIO */}
      {step === 4 && project && (
        <VoiceStudio
          voices={voices}
          stylePresets={stylePresets}
          selectedVoiceId={voiceId}
          onSelectVoice={setVoiceId}
          stylePrompt={stylePrompt}
          onStylePromptChange={setStylePrompt}
          speed={speed}
          onSpeedChange={setSpeed}
          pitch={pitch}
          onPitchChange={setPitch}
          originalAudioVolume={originalAudioVolume}
          onOriginalAudioVolumeChange={setOriginalAudioVolume}
          burnSubtitles={burnSubtitles}
          onBurnSubtitlesChange={setBurnSubtitles}
          busy={busy}
          onRender={handleRender}
          onVoiceCreated={(created) =>
            setVoices((prev) => [...prev, created])
          }
        />
      )}

      {/* STEP 5: PREVIEW & DOWNLOAD DUBBED VIDEO */}
      {step === 5 && project && (
        <ExportPlayer project={project} onChangeVoice={() => setStep(4)} />
      )}
    </div>
  );
}

export default App;

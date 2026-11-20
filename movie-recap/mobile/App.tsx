import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Audio, ResizeMode, Video } from "expo-av";
import { StatusBar } from "expo-status-bar";
import { mobileApi } from "./src/api/client";
import type {
  JobEvent,
  Project,
  VoicePersona,
  VoiceStylePreset,
} from "./src/types";

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
];

export default function App() {
  const [urlInput, setUrlInput] = useState("");
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

  // Import transcript (Copy/Paste text or SRT content)
  const [showImport, setShowImport] = useState(false);
  const [importTarget, setImportTarget] = useState<"original" | "burmese">(
    "original"
  );
  const [importText, setImportText] = useState("");

  // Speaker settings & voice style
  const [voiceId, setVoiceId] = useState("riko");
  const [voiceSearch, setVoiceSearch] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [replaceOriginalVoice, setReplaceOriginalVoice] = useState(true);
  const [burnSubtitles, setBurnSubtitles] = useState(false);

  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobEvent | null>(null);
  const [error, setError] = useState("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    mobileApi.listVoices().then(setVoices).catch(() => {});
    mobileApi.listStylePresets().then(setStylePresets).catch(() => {});
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const currentVoice = useMemo(
    () => voices.find((v) => v.id === voiceId) || voices[0],
    [voices, voiceId]
  );

  const filteredVoices = useMemo(() => {
    const q = voiceSearch.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter((v) =>
      `${v.name} ${v.burmese_label} ${v.style} ${v.use_case} ${v.pitch_label}`
        .toLowerCase()
        .includes(q)
    );
  }, [voices, voiceSearch]);

  const syncProject = (p: Project) => {
    setProject(p);
    setMode(p.mode);
    setRecapStyle(p.recap_style);
    setVoiceId(p.voice_id || "riko");
    setStylePrompt(p.voice_style_prompt || "");
    setReplaceOriginalVoice((p.original_audio_volume ?? 0) === 0);
    setBurnSubtitles(p.burn_subtitles || false);
    const map: Record<string, string> = {};
    for (const s of p.segments) {
      map[s.id] = s.burmese_text;
    }
    setEditedBurmese(map);
  };

  const handleAnalyze = async () => {
    if (!urlInput.trim()) return;
    setError("");
    setBusy(true);
    try {
      const p = await mobileApi.analyzeUrl(urlInput.trim());
      syncProject(p);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze URL");
    } finally {
      setBusy(false);
    }
  };

  const handleTranscribe = async () => {
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const started = await mobileApi.startTranscribe(project.id);
      await mobileApi.pollJob(started.id, setJob);
      syncProject(await mobileApi.getProject(project.id));
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setBusy(false);
    }
  };

  const handleImportTranscript = async () => {
    if (!project || !importText.trim()) return;
    setError("");
    setBusy(true);
    try {
      const updated = await mobileApi.importTranscriptText(
        project.id,
        importText,
        importTarget
      );
      syncProject(updated);
      setImportText("");
      setShowImport(false);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import transcript");
    } finally {
      setBusy(false);
    }
  };

  const handleTranslate = async () => {
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const started = await mobileApi.startTranslate(
        project.id,
        mode,
        recapStyle
      );
      await mobileApi.pollJob(started.id, setJob);
      syncProject(await mobileApi.getProject(project.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Burmese translation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAndPickVoice = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const updated = await mobileApi.saveSegments(
        project.id,
        project.segments.map((s) => ({
          id: s.id,
          burmese_text: editedBurmese[s.id] ?? s.burmese_text,
        }))
      );
      syncProject(updated);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save script");
    } finally {
      setBusy(false);
    }
  };

  const toggleSample = async (voice: VoicePersona) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingVoiceId === voice.id) {
        setPlayingVoiceId(null);
        return;
      }
      setPlayingVoiceId(voice.id);
      const { sound } = await Audio.Sound.createAsync(
        { uri: mobileApi.voicePreviewUrl(voice, stylePrompt) },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.isLoaded && st.didJustFinish) {
          setPlayingVoiceId(null);
        }
      });
    } catch {
      setPlayingVoiceId(null);
    }
  };

  const handleRender = async () => {
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const started = await mobileApi.startRender(project.id, {
        voice_id: voiceId,
        voice_speed: 1.0,
        voice_pitch: 0,
        voice_style_prompt: stylePrompt,
        original_audio_volume: replaceOriginalVoice ? 0.0 : 0.12,
        burn_subtitles: burnSubtitles,
      });
      await mobileApi.pollJob(started.id, setJob);
      syncProject(await mobileApi.getProject(project.id));
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video rendering failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (kind: "video" | "audio" | "srt") => {
    if (!project) return;
    const rel =
      kind === "video"
        ? project.dubbed_video_url
        : kind === "audio"
          ? project.dubbed_audio_url
          : project.srt_url;
    if (!rel) return;
    const ext = kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "srt";
    setBusy(true);
    try {
      await mobileApi.downloadAndShare(rel, `cinerecap_${project.id}.${ext}`);
    } catch (e) {
      Alert.alert(
        "Download Error",
        e instanceof Error ? e.message : "Could not download file"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>CineRecap MM</Text>
        <Text style={styles.subtitle}>
          Burmese Movie Recap · Speaker Settings & Video Download
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {busy && job ? (
          <View style={styles.progressBox}>
            <ActivityIndicator color="#f59e0b" />
            <Text style={styles.progressText}>
              {job.message} ({job.progress}%)
            </Text>
          </View>
        ) : null}

        {/* STEP 1 */}
        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              1. Paste Video URL (YouTube or Any Website)
            </Text>
            <Text style={styles.muted}>
              Supports YouTube, TikTok, Facebook, Vimeo, Dailymotion, Bilibili,
              Instagram, X/Twitter, and direct MP4/M3U8 links.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="https://www.youtube.com/watch?v=... or any video URL"
              placeholderTextColor="#64748b"
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              disabled={busy}
              onPress={handleAnalyze}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Analyzing..." : "Analyze Video URL"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2 */}
        {step === 2 && project && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>2. Video Analysis & Language</Text>
            {project.thumbnail_url ? (
              <Image
                source={{ uri: mobileApi.mediaUrl(project.thumbnail_url) }}
                style={styles.thumb}
              />
            ) : null}
            <Text style={styles.videoTitle}>{project.title}</Text>
            <Text style={styles.muted}>
              Platform: {project.platform} · Language:{" "}
              {project.detected_language_name}
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              disabled={busy}
              onPress={handleTranscribe}
            >
              <Text style={styles.primaryBtnText}>
                Detect Language & Generate Transcript
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() => {
                setShowImport(true);
                setStep(3);
              }}
            >
              <Text style={styles.secondaryBtnText}>
                Import Transcript (Paste / SRT / TXT) Instead
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 3 */}
        {step === 3 && project && (
          <View style={styles.card}>
            <View style={styles.between}>
              <Text style={styles.cardTitle}>
                3. Burmese Script & Transcript Import
              </Text>
              <TouchableOpacity
                style={styles.sampleBtn}
                onPress={() => setShowImport((v) => !v)}
              >
                <Text style={styles.sampleBtnText}>
                  {showImport ? "Hide Import" : "Import SRT/TXT"}
                </Text>
              </TouchableOpacity>
            </View>

            {(showImport || project.segments.length === 0) && (
              <View style={styles.segBox}>
                <Text style={styles.voiceName}>
                  Copy / Paste Transcript or SRT Content
                </Text>
                <View style={[styles.chipRow, { marginTop: 8 }]}>
                  {(["original", "burmese"] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.chip,
                        importTarget === t && styles.chipActive,
                      ]}
                      onPress={() => setImportTarget(t)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          importTarget === t && styles.chipTextActive,
                        ]}
                      >
                        {t === "original"
                          ? "Original Transcript"
                          : "Already Burmese"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.segInput, { minHeight: 100 }]}
                  multiline
                  placeholder="Paste plain text lines, [00:05] lines, or SRT subtitle blocks..."
                  placeholderTextColor="#64748b"
                  value={importText}
                  onChangeText={setImportText}
                />
                <TouchableOpacity
                  style={styles.primaryBtn}
                  disabled={busy}
                  onPress={handleImportTranscript}
                >
                  <Text style={styles.primaryBtnText}>
                    Apply Imported Transcript
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.chipRow, { marginTop: 12 }]}>
              {(["recap", "literal"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.chip, mode === m && styles.chipActive]}
                  onPress={() => setMode(m)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      mode === m && styles.chipTextActive,
                    ]}
                  >
                    {m === "recap" ? "Movie Recap Mode" : "Literal Translation"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === "recap" && (
              <View style={styles.chipRow}>
                {(["suspense", "funny", "dramatic", "short60"] as const).map(
                  (st) => (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.chip,
                        recapStyle === st && styles.chipActive,
                      ]}
                      onPress={() => setRecapStyle(st)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          recapStyle === st && styles.chipTextActive,
                        ]}
                      >
                        {st}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            )}

            {project.segments.length > 0 && (
              <TouchableOpacity
                style={styles.primaryBtn}
                disabled={busy}
                onPress={handleTranslate}
              >
                <Text style={styles.primaryBtnText}>
                  Generate Burmese Script
                </Text>
              </TouchableOpacity>
            )}

            {project.segments.map((seg) => (
              <View key={seg.id} style={styles.segBox}>
                <Text style={styles.muted}>{seg.original_text}</Text>
                <TextInput
                  style={styles.segInput}
                  multiline
                  value={editedBurmese[seg.id] ?? seg.burmese_text}
                  onChangeText={(val) =>
                    setEditedBurmese((prev) => ({ ...prev, [seg.id]: val }))
                  }
                  placeholder="Burmese text..."
                  placeholderTextColor="#64748b"
                />
              </View>
            ))}

            {project.segments.some((s) =>
              (editedBurmese[s.id] || s.burmese_text).trim()
            ) && (
              <TouchableOpacity
                style={styles.successBtn}
                disabled={busy}
                onPress={handleSaveAndPickVoice}
              >
                <Text style={styles.successBtnText}>
                  Save Script & Choose Voice
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* STEP 4: SPEAKER SETTINGS & VOICE STYLE */}
        {step === 4 && project && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>4. Speaker Settings & Voice Style</Text>

            {currentVoice && (
              <View style={styles.currentVoiceBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.muted}>Current voice</Text>
                  <Text style={styles.voiceName}>{currentVoice.name}</Text>
                  <Text style={styles.voiceMy}>
                    {currentVoice.burmese_label} · {currentVoice.pitch_label}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.circlePlay}
                  onPress={() => toggleSample(currentVoice)}
                >
                  <Text style={styles.sampleBtnText}>
                    {playingVoiceId === currentVoice.id ? "■" : "▶"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Voice Style Prompt & Presets */}
            <Text style={[styles.voiceName, { marginTop: 10 }]}>
              Voice Style Prompt
            </Text>
            <TextInput
              style={styles.stylePromptInput}
              multiline
              placeholder="Describe the voice style. e.g. Tone, mood, pace..."
              placeholderTextColor="#64748b"
              value={stylePrompt}
              onChangeText={setStylePrompt}
            />
            <View style={styles.chipRow}>
              {stylePresets.map((p) => {
                const active =
                  stylePrompt.trim().toLowerCase() === p.prompt.toLowerCase();
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setStylePrompt(active ? "" : p.prompt)}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Search voices (Riko, Bodi, Lumi, Sola, Koda...)"
              placeholderTextColor="#64748b"
              value={voiceSearch}
              onChangeText={setVoiceSearch}
            />

            {filteredVoices.map((v) => {
              const selected = v.id === voiceId;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.voiceCard, selected && styles.voiceCardActive]}
                  onPress={() => setVoiceId(v.id)}
                >
                  <View style={styles.between}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.voiceName}>{v.name}</Text>
                      <Text style={styles.muted}>
                        {v.style} · {v.pitch_label} ({v.use_case})
                      </Text>
                      <Text style={styles.voiceMy}>{v.burmese_label}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.circlePlay}
                      onPress={() => toggleSample(v)}
                    >
                      <Text style={styles.sampleBtnText}>
                        {playingVoiceId === v.id ? "■" : "▶"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Completely replace original voice (mute original)
              </Text>
              <Switch
                value={replaceOriginalVoice}
                onValueChange={setReplaceOriginalVoice}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Burn Burmese subtitles</Text>
              <Switch value={burnSubtitles} onValueChange={setBurnSubtitles} />
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              disabled={busy}
              onPress={handleRender}
            >
              <Text style={styles.primaryBtnText}>
                Replace Voice & Render Video
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 5 */}
        {step === 5 && project && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>5. Preview & Download Video</Text>
            <Text style={styles.muted}>
              Your Burmese voice-over has replaced the original video audio.
            </Text>

            {project.has_dubbed_video && (
              <Video
                source={{
                  uri: mobileApi.mediaUrl(project.dubbed_video_url, true),
                }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
              />
            )}

            <TouchableOpacity
              style={styles.successBtn}
              disabled={busy}
              onPress={() => handleDownload("video")}
            >
              <Text style={styles.successBtnText}>
                Download / Save Video (.mp4)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() => handleDownload("audio")}
            >
              <Text style={styles.secondaryBtnText}>
                Download Voice-Over Audio (.mp3)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setStep(4)}
            >
              <Text style={styles.secondaryBtnText}>Try Another Voice</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0e14" },
  scroll: { padding: 18, paddingBottom: 48 },
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#94a3b8", fontSize: 13, marginBottom: 16 },
  card: {
    backgroundColor: "#131823",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#273145",
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  muted: { color: "#94a3b8", fontSize: 13, marginBottom: 4 },
  input: {
    backgroundColor: "#1a2130",
    color: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#273145",
    padding: 12,
    marginVertical: 10,
  },
  stylePromptInput: {
    backgroundColor: "#0b0e14",
    color: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#3b82f6",
    padding: 12,
    marginVertical: 8,
    minHeight: 64,
  },
  currentVoiceBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0b0e14",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#273145",
    padding: 12,
    marginVertical: 8,
  },
  circlePlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0b0e14",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    backgroundColor: "#f59e0b",
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  primaryBtnText: { color: "#0b0e14", fontWeight: "700", fontSize: 15 },
  successBtn: {
    backgroundColor: "#22c55e",
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  successBtnText: { color: "#052e16", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    backgroundColor: "#1a2130",
    borderWidth: 1,
    borderColor: "#273145",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryBtnText: { color: "#f8fafc", fontWeight: "600" },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.16)",
    borderColor: "#ef4444",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: "#fecaca" },
  progressBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(245,158,11,0.14)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  progressText: { color: "#fcd34d", flex: 1 },
  thumb: { width: "100%", height: 180, borderRadius: 10, marginVertical: 10 },
  videoTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#1a2130",
    borderWidth: 1,
    borderColor: "#273145",
  },
  chipActive: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  chipText: { color: "#cbd5e1", fontSize: 12 },
  chipTextActive: { color: "#0b0e14", fontWeight: "700" },
  segBox: {
    backgroundColor: "#1a2130",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  segInput: {
    color: "#f8fafc",
    backgroundColor: "#0b0e14",
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    minHeight: 54,
  },
  voiceCard: {
    backgroundColor: "#1a2130",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#273145",
  },
  voiceCardActive: {
    borderColor: "#f59e0b",
    backgroundColor: "rgba(245,158,11,0.12)",
  },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  voiceName: { color: "#f8fafc", fontWeight: "700", fontSize: 15 },
  voiceMy: { color: "#fcd34d", fontSize: 13, marginTop: 2 },
  sampleBtn: {
    backgroundColor: "#0b0e14",
    borderColor: "#334155",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sampleBtnText: { color: "#f8fafc", fontSize: 12, fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  switchLabel: { color: "#e2e8f0", flex: 1, paddingRight: 10 },
  video: {
    width: "100%",
    height: 220,
    backgroundColor: "#000",
    borderRadius: 10,
    marginTop: 10,
  },
});

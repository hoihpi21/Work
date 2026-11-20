import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type {
  JobEvent,
  Project,
  VoicePersona,
  VoiceStylePreset,
} from "../types";

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) msg = String(data.detail);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const mobileApi = {
  analyzeUrl(url: string) {
    return request<Project>("/api/projects/analyze", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },
  getProject(id: string) {
    return request<Project>(`/api/projects/${id}`);
  },
  importTranscriptText(
    projectId: string,
    content: string,
    target: "original" | "burmese" = "original"
  ) {
    return request<Project>(`/api/projects/${projectId}/import-transcript`, {
      method: "POST",
      body: JSON.stringify({ content, target, format: "auto" }),
    });
  },
  listVoices() {
    return request<VoicePersona[]>("/api/voices");
  },
  listStylePresets() {
    return request<VoiceStylePreset[]>("/api/voices/style-presets");
  },
  startTranscribe(projectId: string) {
    return request<JobEvent>(`/api/projects/${projectId}/transcribe`, {
      method: "POST",
    });
  },
  startTranslate(
    projectId: string,
    mode: "literal" | "recap",
    recap_style: "suspense" | "funny" | "dramatic" | "short60"
  ) {
    return request<JobEvent>(`/api/projects/${projectId}/translate`, {
      method: "POST",
      body: JSON.stringify({ mode, recap_style }),
    });
  },
  saveSegments(
    projectId: string,
    segments: Array<{ id: string; burmese_text: string }>
  ) {
    return request<Project>(`/api/projects/${projectId}/segments`, {
      method: "PATCH",
      body: JSON.stringify({ segments }),
    });
  },
  startRender(
    projectId: string,
    payload: {
      voice_id: string;
      voice_speed: number;
      voice_pitch: number;
      voice_style_prompt: string;
      original_audio_volume: number;
      burn_subtitles: boolean;
    }
  ) {
    return request<JobEvent>(`/api/projects/${projectId}/render`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  mediaUrl(relativePath: string | null, inline = false): string {
    if (!relativePath) return "";
    const sep = relativePath.includes("?") ? "&" : "?";
    return `${API_BASE}${relativePath}${inline ? `${sep}inline=1` : ""}`;
  },
  voicePreviewUrl(voice: VoicePersona, stylePrompt = ""): string {
    const base = `${API_BASE}${voice.preview_url}`;
    if (!stylePrompt.trim()) return base;
    return `${base}?style_prompt=${encodeURIComponent(stylePrompt.trim())}`;
  },
  async pollJob(
    jobId: string,
    onProgress: (ev: JobEvent) => void
  ): Promise<JobEvent> {
    while (true) {
      const ev = await request<JobEvent>(`/api/jobs/${jobId}`);
      onProgress(ev);
      if (ev.status === "completed") return ev;
      if (ev.status === "failed") {
        throw new Error(ev.message || "Background job failed");
      }
      await new Promise((r) => setTimeout(r, 900));
    }
  },
  async downloadAndShare(
    relativePath: string,
    filename: string
  ): Promise<string> {
    const remoteUrl = `${API_BASE}${relativePath}`;
    const localUri = `${FileSystem.documentDirectory}${filename}`;
    const result = await FileSystem.downloadAsync(remoteUrl, localUri);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri);
    }
    return result.uri;
  },
};

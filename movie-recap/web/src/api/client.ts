import type {
  JobEvent,
  Project,
  VoicePersona,
  VoiceStylePreset,
} from "../types";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

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
      // ignore json parse error
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  analyzeUrl(url: string) {
    return request<Project>("/api/projects/analyze", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },
  async uploadVideo(file: File, title?: string): Promise<Project> {
    const form = new FormData();
    form.append("file", file);
    if (title?.trim()) form.append("title", title.trim());
    const res = await fetch(`${API_BASE}/api/projects/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      let msg = `Upload failed (${res.status})`;
      try {
        const data = await res.json();
        if (data?.detail) msg = String(data.detail);
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.json() as Promise<Project>;
  },
  importTranscriptText(
    projectId: string,
    content: string,
    target: "original" | "burmese" = "original",
    format: "auto" | "srt" | "vtt" | "txt" = "auto"
  ) {
    return request<Project>(`/api/projects/${projectId}/import-transcript`, {
      method: "POST",
      body: JSON.stringify({ content, target, format }),
    });
  },
  async importTranscriptFile(
    projectId: string,
    file: File,
    target: "original" | "burmese" = "original"
  ): Promise<Project> {
    const form = new FormData();
    form.append("file", file);
    form.append("target", target);
    const res = await fetch(
      `${API_BASE}/api/projects/${projectId}/import-transcript-file`,
      {
        method: "POST",
        body: form,
      }
    );
    if (!res.ok) {
      let msg = `Transcript import failed (${res.status})`;
      try {
        const data = await res.json();
        if (data?.detail) msg = String(data.detail);
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.json() as Promise<Project>;
  },
  async importAudioForScript(
    projectId: string,
    file: File,
    autoTranscribe = true,
    target: "original" | "burmese" = "original"
  ): Promise<Project> {
    const form = new FormData();
    form.append("file", file);
    form.append("auto_transcribe", String(autoTranscribe));
    form.append("target", target);
    const res = await fetch(
      `${API_BASE}/api/projects/${projectId}/import-audio`,
      {
        method: "POST",
        body: form,
      }
    );
    if (!res.ok) {
      let msg = `Audio import failed (${res.status})`;
      try {
        const data = await res.json();
        if (data?.detail) msg = String(data.detail);
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.json() as Promise<Project>;
  },
  listProjects() {
    return request<Project[]>("/api/projects");
  },
  getProject(id: string) {
    return request<Project>(`/api/projects/${id}`);
  },
  deleteProject(id: string) {
    return request<{ deleted: boolean }>(`/api/projects/${id}`, {
      method: "DELETE",
    });
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
  listVoices() {
    return request<VoicePersona[]>("/api/voices");
  },
  listStylePresets() {
    return request<VoiceStylePreset[]>("/api/voices/style-presets");
  },
  createCustomVoice(payload: {
    name: string;
    burmese_label: string;
    gender: "male" | "female" | "neutral";
    age_group: "young" | "adult" | "senior";
    pitch_label:
      | "Low pitch"
      | "Medium-low pitch"
      | "Medium pitch"
      | "High pitch"
      | "Very high pitch";
    use_case: string;
    style: string;
    style_prompt: string;
  }) {
    return request<VoicePersona>("/api/voices/custom", {
      method: "POST",
      body: JSON.stringify(payload),
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
  watchJob(jobId: string, onEvent: (ev: JobEvent) => void): Promise<JobEvent> {
    return new Promise((resolve, reject) => {
      const es = new EventSource(`${API_BASE}/api/jobs/${jobId}/events`);
      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "heartbeat") return;
          onEvent(data as JobEvent);
          if (data.status === "completed") {
            es.close();
            resolve(data as JobEvent);
          } else if (data.status === "failed") {
            es.close();
            reject(new Error(data.message || "Background job failed"));
          }
        } catch {
          // ignore malformed event
        }
      };
      es.onerror = () => {
        es.close();
        reject(new Error("Lost connection to job progress stream"));
      };
    });
  },
};

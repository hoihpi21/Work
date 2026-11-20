export interface Segment {
  id: string;
  index: number;
  start_sec: number;
  end_sec: number;
  original_text: string;
  burmese_text: string;
}

export interface Project {
  id: string;
  url: string;
  title: string;
  uploader: string;
  platform: string;
  thumbnail_url: string;
  duration_sec: number;
  detected_language: string;
  detected_language_name: string;
  language_confidence: number;
  mode: "literal" | "recap";
  recap_style: "suspense" | "funny" | "dramatic" | "short60";
  voice_id: string;
  voice_speed: number;
  voice_pitch: number;
  voice_style_prompt: string;
  original_audio_volume: number;
  burn_subtitles: boolean;
  status: string;
  error_message: string;
  has_source_video: boolean;
  has_source_audio: boolean;
  has_dubbed_audio: boolean;
  has_dubbed_video: boolean;
  has_srt: boolean;
  source_video_url: string | null;
  source_audio_url: string | null;
  dubbed_video_url: string | null;
  dubbed_audio_url: string | null;
  srt_url: string | null;
  created_at: string;
  updated_at: string;
  segments: Segment[];
}

export interface JobEvent {
  id: string;
  project_id: string;
  stage: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
}

export interface VoicePersona {
  id: string;
  name: string;
  burmese_label: string;
  language: string;
  gender: "male" | "female" | "neutral";
  age_group: "young" | "adult" | "senior";
  pitch_label: string;
  use_case: string;
  style: string;
  description: string;
  provider: string;
  preview_url: string;
}

export interface VoiceStylePreset {
  id: string;
  name: string;
  prompt: string;
}

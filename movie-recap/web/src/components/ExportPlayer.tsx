import { useState } from "react";
import { AlertCircle, Download, FileText, Music, RefreshCw, RotateCcw } from "lucide-react";
import { api } from "../api/client";
import type { Project } from "../types";

interface Props {
  project: Project;
  onChangeVoice: () => void;
}

export function ExportPlayer({ project, onChangeVoice }: Props) {
  const [reloadNonce, setReloadNonce] = useState(0);
  const [videoError, setVideoError] = useState(false);

  const baseInlineUrl = api.mediaUrl(project.dubbed_video_url, true);
  const inlineVideoUrl = baseInlineUrl
    ? `${baseInlineUrl}&v=${encodeURIComponent(project.updated_at)}_${reloadNonce}`
    : "";
  const downloadVideoUrl = api.mediaUrl(project.dubbed_video_url, false);
  const downloadAudioUrl = api.mediaUrl(project.dubbed_audio_url, false);
  const downloadSrtUrl = api.mediaUrl(project.srt_url, false);

  return (
    <div className="card">
      <div className="between">
        <div>
          <h2>Final Burmese Recapped Video Ready</h2>
          <p className="muted">
            Original video voice has been replaced with your chosen Burmese voice-over. Preview below or download directly.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onChangeVoice}>
          <RotateCcw size={15} />
          Try Another Voice
        </button>
      </div>

      {project.has_dubbed_video ? (
        <>
          <video
            key={inlineVideoUrl}
            className="video-player"
            controls
            preload="metadata"
            playsInline
            src={inlineVideoUrl}
            onError={() => setVideoError(true)}
            onLoadedData={() => setVideoError(false)}
          />
          {videoError && (
            <div className="between" style={{ marginTop: 10 }}>
              <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <AlertCircle size={15} />
                If the browser preview is still buffering, click Reload Preview or Download Video (.mp4).
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setVideoError(false);
                  setReloadNonce((n) => n + 1);
                }}
              >
                <RefreshCw size={14} />
                Reload Preview
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted">Video not rendered yet.</p>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        {project.has_dubbed_video && (
          <a className="btn btn-success" href={downloadVideoUrl} download>
            <Download size={17} />
            Download Video (.mp4)
          </a>
        )}
        {project.has_dubbed_audio && (
          <a className="btn btn-secondary" href={downloadAudioUrl} download>
            <Music size={16} />
            Download Voice-Over Audio (.mp3)
          </a>
        )}
        {project.has_srt && (
          <a className="btn btn-secondary" href={downloadSrtUrl} download>
            <FileText size={16} />
            Download Burmese Subtitles (.srt)
          </a>
        )}
      </div>
    </div>
  );
}

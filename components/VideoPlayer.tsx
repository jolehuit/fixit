'use client';

import { useEffect, useRef, useState } from 'react';

export type VideoPlayerProps = {
  url: string;
  vttUrl?: string;
};

export function VideoPlayer({ url, vttUrl }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      setMuted(true);
      v.play().catch(() => {});
    });
    if (!v.muted) setMuted(false);
  }, []);

  const unmute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {});
    setMuted(false);
  };

  const replay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-black">
        {/* biome-ignore lint/a11y/useMediaCaption: subtitles are burned-in by ffmpeg per the PRD */}
        <video ref={videoRef} src={url} autoPlay playsInline controls className="block w-full">
          {vttUrl ? <track kind="subtitles" src={vttUrl} srcLang="en" default /> : null}
        </video>
        {muted ? (
          <button
            type="button"
            onClick={unmute}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/90"
          >
            <SpeakerIcon /> Unmute
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={replay}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--color-fg)] transition hover:border-[color:var(--color-border-strong)]"
        >
          <ReplayIcon /> Replay
        </button>
        <span className="text-xs text-[color:var(--color-muted)]">
          Captions burned in · 720p · English voiceover
        </span>
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Sound</title>
      <path d="M3 6h2l3.5-3v10L5 10H3V6Z" />
      <path d="M11 6.5c.7.5 1 1.2 1 1.9s-.3 1.4-1 1.9" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Replay</title>
      <path d="M3 4v3h3" />
      <path d="M3.5 7A5 5 0 1 1 4 11" />
    </svg>
  );
}

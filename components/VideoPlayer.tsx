'use client';

/**
 * VideoPlayer — final video, autoplay + audio + FR subtitles.
 * Owner: Role A.
 *
 * If subtitles are burned-in by ffmpeg (per the PRD), this player just needs
 * to play the file. If subtitles come as a separate WebVTT track, accept
 * `vttUrl` and add a <track>.
 */

export type VideoPlayerProps = {
  url: string;
  vttUrl?: string;
  onReplay?: () => void;
};

export function VideoPlayer({ url, vttUrl, onReplay }: VideoPlayerProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* biome-ignore lint/a11y/useMediaCaption: subtitles are burned-in by ffmpeg per the PRD */}
      <video src={url} controls autoPlay playsInline className="w-full rounded-2xl bg-black">
        {vttUrl ? <track kind="subtitles" src={vttUrl} srcLang="fr" default /> : null}
      </video>
      {onReplay ? (
        <button
          type="button"
          onClick={onReplay}
          className="self-start rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm hover:border-[color:var(--color-accent)]"
        >
          ↻ Relancer le diagnostic
        </button>
      ) : null}
    </div>
  );
}

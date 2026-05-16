'use client';

/**
 * PhotoUpload — single component handles both mobile camera capture and
 * desktop drag-and-drop / file picker. Owner: Role A.
 *
 * Contract:
 *   - On a successful upload, calls `onUploaded(url)` with a public URL
 *     (typically a Vercel Blob URL).
 *   - The actual upload logic is TBD: either client-side via /api/blob/upload
 *     route (to be added by Role A or D), or server-side via Vercel Blob
 *     client uploads.
 *
 * STUB: shows the prop contract; replace internals.
 */

import { useState } from 'react';

export type PhotoUploadProps = {
  onUploaded: (url: string) => void;
  /** Optional: pre-filled URL (e.g. cached demo). */
  initialUrl?: string;
};

export function PhotoUpload({ onUploaded, initialUrl }: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);

  const onChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    // TODO(Role A): upload to Blob, then call onUploaded with the public URL.
    onUploaded(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-card)] text-sm text-[color:var(--color-muted)] hover:border-[color:var(--color-accent)]">
        {preview ? (
          // biome-ignore lint/performance/noImgElement: external object URLs from camera
          <img src={preview} alt="" className="h-full w-full rounded-2xl object-cover" />
        ) : (
          <>
            <span>📷 Prendre une photo ou téléverser</span>
            <span className="text-xs">JPEG/PNG · 10MB max</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onChange}
          className="hidden"
        />
      </label>
    </div>
  );
}

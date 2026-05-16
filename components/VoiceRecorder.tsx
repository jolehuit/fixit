'use client';

/**
 * VoiceRecorder — captures mic input, streams to Gradium STT over a
 * WebSocket, surfaces the live FR transcript. Owner: Role A.
 *
 * Gradium STT WS: see lib/gradium.ts → GRADIUM_STT_WS_URL.
 *
 * Contract:
 *   - On final transcript, calls `onTranscript(text)`.
 *   - On partial transcript (while user is still speaking), calls
 *     `onPartial?.(text)` if provided.
 *
 * Note on auth: connecting directly from the browser to wss://api.gradium.ai
 * needs a short-lived signed token. Role D should add /api/gradium/token
 * that returns one (or use Gradium's per-message auth if supported).
 *
 * STUB: shows the prop contract; replace internals.
 */

import { useState } from 'react';

export type VoiceRecorderProps = {
  onTranscript: (text: string) => void;
  onPartial?: (text: string) => void;
};

export function VoiceRecorder({ onTranscript, onPartial: _onPartial }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState('');

  const toggle = () => {
    // TODO(Role A): open WS to Gradium STT, pipe MediaRecorder PCM/WAV chunks,
    // call onPartial as text comes in, onTranscript on flush/end.
    setRecording((r) => !r);
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition ${
          recording
            ? 'bg-[color:var(--color-danger)] text-white'
            : 'bg-[color:var(--color-fg)] text-black'
        }`}
      >
        {recording ? '⏺ Arrêter' : '🎙 Décrire le problème'}
      </button>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text && onTranscript(text)}
        placeholder="… ou tapez directement ici"
        rows={3}
        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3 text-sm"
      />
    </div>
  );
}

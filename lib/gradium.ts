/**
 * Gradium TTS (REST) + STT (WebSocket) helpers.
 *
 * Docs: https://docs.gradium.ai
 * TTS REST: POST {region}.api.gradium.ai/api/post/speech/tts
 *   - Body: { text, voice_id, output_format, only_audio }
 *   - Header: x-api-key
 *   - Returns: raw audio bytes (only_audio:true) or NDJSON stream
 * STT WS:   wss://api.gradium.ai/api/speech/asr
 *
 * Role C uses synthesize() in /api/narrate.
 * Role A uses the STT WebSocket URL directly from the browser.
 */

import { env } from './env';

const baseUrl = () =>
  env.GRADIUM_REGION === 'us' ? 'https://us.api.gradium.ai' : 'https://eu.api.gradium.ai';

export const GRADIUM_TTS_URL = () => `${baseUrl()}/api/post/speech/tts`;
export const GRADIUM_STT_WS_URL = 'wss://api.gradium.ai/api/speech/asr';

export type SynthesizeOptions = {
  text: string;
  voice_id?: string;
  output_format?: 'wav' | 'pcm' | 'opus' | 'pcm_24000' | 'pcm_48000';
};

/**
 * One-shot TTS. Returns the WAV (or chosen format) as a Buffer.
 * Role C uploads this buffer to Vercel Blob and surfaces the URL on
 * `narration_done` events.
 */
export async function synthesize(opts: SynthesizeOptions): Promise<Buffer> {
  const apiKey = env.GRADIUM_API_KEY;
  if (!apiKey) {
    throw new Error('GRADIUM_API_KEY is not set');
  }
  const res = await fetch(GRADIUM_TTS_URL(), {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: opts.text,
      voice_id: opts.voice_id ?? env.GRADIUM_TTS_VOICE_ID,
      output_format: opts.output_format ?? 'wav',
      only_audio: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gradium TTS failed (${res.status}): ${errText}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

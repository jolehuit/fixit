/**
 * Centralized env access. Import this instead of `process.env` so that:
 *  - typos are caught at compile time
 *  - we never leak server-only secrets to the client
 *  - we can swap implementations (e.g. Vault, Doppler) in one place
 *
 * Anything declared here is server-only. Do NOT use this file from a
 * Client Component. Browser-safe values must be prefixed `NEXT_PUBLIC_`
 * and imported via `process.env.NEXT_PUBLIC_…` at the call site.
 */

const optional = (k: string): string | undefined => process.env[k];

export const env = {
  OPENAI_API_KEY: optional('OPENAI_API_KEY'),
  FAL_KEY: optional('FAL_KEY'),
  TAVILY_API_KEY: optional('TAVILY_API_KEY'),
  GRADIUM_API_KEY: optional('GRADIUM_API_KEY'),
  GRADIUM_TTS_VOICE_ID: optional('GRADIUM_TTS_VOICE_ID') ?? 'YTpq7expH9539ERJ',
  GRADIUM_REGION: (optional('GRADIUM_REGION') ?? 'eu') as 'eu' | 'us',
  BLOB_READ_WRITE_TOKEN: optional('BLOB_READ_WRITE_TOKEN'),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
} as const;

export type EnvKey = keyof typeof env;

export function requireEnv(key: EnvKey): string {
  const v = env[key];
  if (!v) {
    throw new Error(
      `Missing required env: ${key}. Set it in .env.local or in Vercel project settings.`,
    );
  }
  return String(v);
}

/** Returns true when every required key is present — useful for landing-page hints. */
export function isFullyConfigured(): boolean {
  return Boolean(
    env.OPENAI_API_KEY &&
      env.FAL_KEY &&
      env.TAVILY_API_KEY &&
      env.GRADIUM_API_KEY &&
      env.BLOB_READ_WRITE_TOKEN,
  );
}

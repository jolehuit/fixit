import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const config: NextConfig = {
  // Pin the workspace root so Turbopack doesn't get confused by stray
  // lockfiles in parent directories.
  turbopack: {
    root: import.meta.dirname,
  },
  serverExternalPackages: ['ffmpeg-static'],
  // outputFileTracingIncludes only applies at build time (next build) — gating
  // it behind production avoids a Turbopack 16.2.6 bug where the glob walks
  // node_modules in dev and fork-bombs hundreds of workers (~80GB RAM on a 32GB
  // Mac). Production builds still bundle ffmpeg-static into the stitch route.
  ...(isProd && {
    outputFileTracingIncludes: {
      'app/api/stitch/route': ['./node_modules/ffmpeg-static/**'],
    },
  }),
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default config;

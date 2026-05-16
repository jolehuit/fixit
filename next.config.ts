import type { NextConfig } from 'next';

const config: NextConfig = {
  // Pin the workspace root so Turbopack doesn't get confused by stray
  // lockfiles in parent directories.
  turbopack: {
    root: import.meta.dirname,
  },
  // Ensure ffmpeg-static's prebuilt binary is bundled into the stitch route.
  outputFileTracingIncludes: {
    'app/api/stitch/route': ['./node_modules/ffmpeg-static/**'],
  },
  serverExternalPackages: ['ffmpeg-static'],
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default config;

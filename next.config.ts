import type { NextConfig } from 'next';

const config: NextConfig = {
  // Pin the workspace root so Turbopack doesn't get confused by stray
  // lockfiles in parent directories.
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default config;

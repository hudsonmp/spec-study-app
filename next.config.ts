import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin Turbopack to this package root so the stray ~/package-lock.json
  // doesn't get auto-selected as the workspace root (which prevents
  // proxy.ts at this directory from being recognized).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small — see Dockerfile.
  // Vercel's own build pipeline is incompatible with it (breaks its
  // *.nft.json trace files), so it's skipped there — Vercel sets the
  // VERCEL env var automatically during its builds.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;

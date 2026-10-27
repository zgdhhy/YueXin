import type { NextConfig } from "next";

const config: NextConfig = {
  // Separate build cache for isolated integration tests.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@paper/core", "@paper/video"],
  serverExternalPackages: ["better-sqlite3"],
  // Keep the mobile navigation and site mark unobstructed during local previews.
  devIndicators: false,
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
};

export default config;

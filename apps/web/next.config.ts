import type { NextConfig } from "next";

const config: NextConfig = {
  // Separate build cache for isolated integration tests.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@paper/core", "@paper/video"],
  // esbuild 用于检查镜头代码（@paper/core/script），含原生二进制，不能被打包
  serverExternalPackages: ["better-sqlite3", "esbuild"],
  // Keep the mobile navigation and site mark unobstructed during local previews.
  devIndicators: false,
  // proxy 默认只缓存 10MB 请求体并静默截断超出部分，与 server action 的上传上限对齐
  experimental: { serverActions: { bodySizeLimit: "50mb" }, proxyClientMaxBodySize: "50mb" },
};

export default config;

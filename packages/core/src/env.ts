import fs from "node:fs";
import path from "node:path";

function findRoot(start: string): string {
  let dir = start;
  while (true) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, "utf8")).workspaces) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export const ROOT_DIR = findRoot(process.cwd());

const envFile = path.join(ROOT_DIR, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const env = {
  dataDir: path.resolve(ROOT_DIR, process.env.DATA_DIR ?? "data"),
  hfEndpoint: (process.env.HF_ENDPOINT ?? "https://huggingface.co").replace(/\/$/, ""),
  siteUrl: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  migrationsDir: path.join(ROOT_DIR, "packages/core/drizzle"),
};

/** DATA_DIR 下的绝对路径 */
export function dataPath(...parts: string[]) {
  return path.join(env.dataDir, ...parts);
}

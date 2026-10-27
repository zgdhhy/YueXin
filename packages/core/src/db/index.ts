import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env, dataPath } from "../env";
import * as schema from "./schema";

function open() {
  fs.mkdirSync(env.dataDir, { recursive: true });
  const sqlite = new Database(dataPath("app.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: env.migrationsDir });
  return db;
}

// web 与 worker 是两个进程，各自持有一个连接；开发时热重载复用同一个
const g = globalThis as unknown as { __paperDb?: ReturnType<typeof open> };
export const db = (g.__paperDb ??= open());
export { schema };

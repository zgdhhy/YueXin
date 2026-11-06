import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { configurationIssue, dataPath, enqueueRun, REFERENCE_DIR } from "@paper/core";
import { getSession } from "@/lib/auth";

/** 参考视频上传上限 */
const MAX_BYTES = 200 * 1024 * 1024;
const EXT: Record<string, string> = { "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-matroska": ".mkv" };

const reply = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * 上传参考视频：请求体就是视频文件本身（流式写盘，不经过 server action 的大小限制），
 * 保存后排一次「参考视频分析」运行，由 worker 分析并生成风格与样片。
 */
export async function POST(req: Request) {
  if (!(await getSession()).loggedIn) return reply({ error: "登录已过期，请重新登录" }, 401);
  if (req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "无效请求来源" }, 403);
  const ext = EXT[(req.headers.get("content-type") ?? "").split(";")[0].trim()];
  if (!ext) return reply({ error: "只支持 mp4、mov、webm、mkv 视频" }, 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return reply({ error: "视频超过 200MB" }, 413);
  const issue = configurationIssue();
  if (issue) return reply({ error: issue }, 409);
  if (!req.body) return reply({ error: "没有收到视频" }, 400);

  const rel = `${REFERENCE_DIR}/${crypto.randomUUID()}${ext}`;
  const file = dataPath(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let size = 0;
  try {
    await pipeline(
      Readable.fromWeb(req.body as import("node:stream/web").ReadableStream),
      async function* (source) {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > MAX_BYTES) throw new Error("视频超过 200MB");
          yield chunk;
        }
      },
      fs.createWriteStream(file),
    );
  } catch (e) {
    fs.rmSync(file, { force: true });
    return reply({ error: e instanceof Error ? e.message : String(e) }, 413);
  }
  if (!size) {
    fs.rmSync(file, { force: true });
    return reply({ error: "没有收到视频" }, 400);
  }
  return reply({ runId: enqueueRun("reference", "manual", { referencePath: rel }) });
}

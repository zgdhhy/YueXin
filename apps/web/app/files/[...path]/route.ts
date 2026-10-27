import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "@paper/core";
import { getSession } from "@/lib/auth";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

/** 提供 DATA_DIR 下的图片、视频（支持 Range，视频可拖动） */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getSession();
  if (!session.loggedIn) return new Response("Unauthorized", { status: 401 });

  const rel = (await params).path.map(decodeURIComponent).join("/");
  const file = path.resolve(env.dataDir, rel);
  const allowed = [path.resolve(env.dataDir, "papers"), path.resolve(env.dataDir, "videos"), path.resolve(env.dataDir, "music")];
  if (!allowed.some((dir) => file.startsWith(dir + path.sep)) || !fs.existsSync(file)) {
    return new Response("Not found", { status: 404 });
  }

  const size = fs.statSync(file).size;
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=86400" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
}

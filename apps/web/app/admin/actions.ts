"use server";

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  db,
  schema,
  dataPath,
  enqueueRun,
  configurationIssue,
  getSetting,
  setSetting,
  selectionSchema,
  videoSchema,
  sendToChannel,
  EVENT_LABELS,
  CHANNEL_LABELS,
  NOTIFY_EVENTS,
  type NotifyEvent,
  saveSchedulePlan,
  env,
} from "@paper/core";
import { encodeWav, synthesizeMusic } from "@paper/video/music";
import { requireAuth } from "@/lib/auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k));
const bool = (f: FormData, k: string) => f.get(k) === "on";
const list = (f: FormData, k: string) =>
  str(f, k)
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
const optId = (f: FormData, k: string) => (str(f, k) ? num(f, k) : null);

function back(path: string, msg?: string): never {
  revalidatePath("/", "layout");
  if (!msg) redirect(path);
  // msg 要放在 #锚点 之前，已有查询参数时用 & 连接
  const [base, hash] = path.split("#");
  redirect(`${base}${base.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`);
}

// ---------- 运行 ----------

export async function triggerRun(f: FormData) {
  await requireAuth();
  const issue = configurationIssue(); if (issue) back("/admin/models", issue);
  const paperIds = list(f, "paperIds").map((s) => s.replace(/^.*arxiv\.org\/(abs|pdf|html)\//, "").replace(/v\d+$/, ""));
  const id = enqueueRun("digest", "manual", paperIds.length ? { paperIds } : { picks: Math.max(1, num(f, "picks") || 1) });
  redirect(`/admin/runs/${id}`);
}

export async function triggerTrendReport(f: FormData) {
  await requireAuth();
  const issue = configurationIssue(); if (issue) back("/admin/models", issue);
  const id = enqueueRun("trend_report", "manual", { month: str(f, "month") || undefined });
  redirect(`/admin/runs/${id}`);
}

// ---------- 定时计划 ----------

export async function saveSchedule(f: FormData) {
  await requireAuth();
  const enabled = bool(f, "enabled");
  const time = str(f, "time");
  try {
    if (str(f, "kind") === "trend_report") saveSchedulePlan({ kind: "trend_report", enabled, day: num(f, "day"), time });
    else saveSchedulePlan({ kind: "digest", enabled, days: f.getAll("days").map(Number), time, picks: num(f, "picks") });
  } catch (e) {
    back("/admin/schedules", e instanceof Error ? e.message : String(e));
  }
  back("/admin/schedules", "已保存");
}

// ---------- 选题与主题 ----------

export async function saveSelection(f: FormData) {
  await requireAuth();
  const parsed = selectionSchema.safeParse({
    sources: { hf: bool(f, "hf"), arxiv: bool(f, "arxiv") },
    lookbackDays: num(f, "lookbackDays"),
    notableRatio: num(f, "notableRatio") / 100,
    notableLookbackDays: num(f, "notableLookbackDays"),
    alternates: num(f, "alternates"),
    shortlistSize: num(f, "shortlistSize"),
    institutions: list(f, "institutions"),
  });
  if (!parsed.success) back("/admin/selection", `参数无效：${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  setSetting("selection", parsed.data);
  back("/admin/selection", "已保存");
}

export async function saveTopic(f: FormData) {
  await requireAuth();
  const values = {
    name: str(f, "name") || "未命名",
    arxivCategories: list(f, "arxivCategories"),
    keywords: list(f, "keywords"),
    weight: num(f, "weight") || 1,
    enabled: bool(f, "enabled"),
  };
  const id = optId(f, "id");
  if (id) db.update(schema.topics).set(values).where(eq(schema.topics.id, id)).run();
  else db.insert(schema.topics).values(values).run();
  back("/admin/selection", "主题已保存");
}

export async function deleteTopic(f: FormData) {
  await requireAuth();
  db.delete(schema.topics).where(eq(schema.topics.id, num(f, "id"))).run();
  back("/admin/selection", "主题已删除");
}

export async function saveVideoSettings(f: FormData) {
  await requireAuth();
  const parsed = videoSchema.safeParse({
    ...getSetting("video"),
    enabled: bool(f, "enabled"),
    musicMode: str(f, "musicMode"),
    musicVolume: num(f, "musicVolume") / 100,
    readingSpeed: num(f, "readingSpeed"),
  });
  if (!parsed.success) back("/admin/video", "参数无效");
  setSetting("video", parsed.data);
  back("/admin/video", "已保存");
}

// ---------- 解读 ----------

export async function setDigestStatus(f: FormData) {
  await requireAuth();
  const status = str(f, "status") === "hidden" ? ("hidden" as const) : ("published" as const);
  db.update(schema.digests).set({ status }).where(eq(schema.digests.id, num(f, "id"))).run();
  back("/admin/digests", status === "hidden" ? "已下线" : "已上线");
}

export async function regenerateDigest(f: FormData) {
  await requireAuth();
  const id = enqueueRun("digest", "manual", { paperIds: [str(f, "paperId")] });
  redirect(`/admin/runs/${id}`);
}

// ---------- 视频与音乐 ----------

export async function rerenderVideo(f: FormData) {
  await requireAuth();
  const id = enqueueRun("digest", "manual", { videoDigestId: num(f, "digestId") });
  redirect(`/admin/runs/${id}`);
}

const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".ogg"];

export async function uploadMusic(f: FormData) {
  await requireAuth();
  const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) back("/admin/video", "请选择音乐文件");
  fs.mkdirSync(dataPath("music"), { recursive: true });
  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    if (!AUDIO_EXT.includes(ext)) back("/admin/video", `不支持的格式：${file.name}`);
    const rel = `music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    fs.writeFileSync(dataPath(rel), Buffer.from(await file.arrayBuffer()));
    db.insert(schema.musicTracks).values({ name: path.basename(file.name, ext), path: rel }).run();
  }
  back("/admin/video", `已上传 ${files.length} 首`);
}

export async function deleteMusic(f: FormData) {
  await requireAuth();
  const t = db.select().from(schema.musicTracks).where(eq(schema.musicTracks.id, num(f, "id"))).get();
  if (t) {
    fs.rmSync(dataPath(t.path), { force: true });
    db.delete(schema.musicTracks).where(eq(schema.musicTracks.id, t.id)).run();
  }
  back("/admin/video", "已删除");
}

/** 生成一段 30 秒的程序化音乐试听 */
export async function previewMusic() {
  await requireAuth();
  const seed = Math.floor(Math.random() * 1e6);
  fs.mkdirSync(dataPath("music"), { recursive: true });
  fs.writeFileSync(dataPath("music", "preview.wav"), encodeWav(synthesizeMusic(30, seed)));
  back("/admin/video", `已生成试听（seed ${seed}）`);
}

// ---------- 通知 ----------

const CHANNEL_TYPES = ["email", "feishu", "wecom", "dingtalk"] as const;
type ChannelType = (typeof CHANNEL_TYPES)[number];
const editHref = (id: number) => `/admin/notify?modal=edit&id=${id}`;

/** 校验并保存表单中的渠道，返回渠道 id；校验失败时带提示回到表单 */
function persistChannel(f: FormData) {
  const type = str(f, "type") as ChannelType;
  if (!CHANNEL_TYPES.includes(type)) back("/admin/notify", "类型无效");
  const id = optId(f, "id");
  const prev = id ? db.select().from(schema.notifyChannels).where(eq(schema.notifyChannels.id, id)).get() : undefined;
  const retry = id ? editHref(id) : `/admin/notify?modal=new&type=${type}`;
  // 密钥不回显：留空表示沿用已保存的值
  const secret = (k: string) => str(f, k) || prev?.config[k] || "";
  const raw: Record<string, string> =
    type === "email"
      ? { to: str(f, "to"), host: str(f, "host"), port: str(f, "port"), user: str(f, "user"), pass: secret("pass"), from: str(f, "from") }
      : { url: str(f, "url"), secret: type === "wecom" ? "" : secret("secret") };
  const config = Object.fromEntries(Object.entries(raw).filter(([, v]) => v));
  if (type === "email" ? !config.to : !config.url) back(retry, type === "email" ? "请填写收件邮箱" : "请填写 Webhook 地址");
  const events = f.getAll("events").map(String).filter((e): e is NotifyEvent => (NOTIFY_EVENTS as readonly string[]).includes(e));
  if (!events.length) back(retry, "请至少选择一个通知事件");
  const values = { name: str(f, "name") || CHANNEL_LABELS[type], type, config, events, enabled: bool(f, "enabled") };
  if (!id) return db.insert(schema.notifyChannels).values(values).returning({ id: schema.notifyChannels.id }).get().id;
  db.update(schema.notifyChannels).set(values).where(eq(schema.notifyChannels.id, id)).run();
  return id;
}

export async function saveChannel(f: FormData) {
  await requireAuth();
  back(editHref(persistChannel(f)), "已保存");
}

export async function deleteChannel(f: FormData) {
  await requireAuth();
  db.delete(schema.notifyChannels).where(eq(schema.notifyChannels.id, num(f, "id"))).run();
  back("/admin/notify", "已删除");
}

/** 先保存表单，再用保存后的配置发送测试消息 */
export async function testChannel(f: FormData) {
  await requireAuth();
  const id = persistChannel(f);
  const c = db.select().from(schema.notifyChannels).where(eq(schema.notifyChannels.id, id)).get()!;
  let msg: string;
  try {
    await sendToChannel(c, {
      title: "AI 前沿论文精读 · 测试消息",
      items: [{ title: "通知渠道配置成功", summary: `以后「${c.events.map((e) => EVENT_LABELS[e]).join("、")}」会推送到这里。`, url: env.siteUrl }],
    });
    msg = "已保存，测试消息已发送";
  } catch (e) {
    msg = `已保存，但发送失败：${String(e).slice(0, 300)}`;
  }
  back(editHref(id), msg);
}

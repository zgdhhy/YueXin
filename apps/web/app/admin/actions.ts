"use server";

import fs from "node:fs";
import path from "node:path";
import { SITE_NAME } from "@/lib/brand";
import { eq, inArray } from "drizzle-orm";
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
  deleteDigests,
  REQUIREMENT_STAGES,
  type RequirementStage,
  saveRequirementVersion,
  activateRequirementVersion,
  getRequirementVersion,
  enqueueTrial,
  activateDigestRevision,
  adoptDigestTrial,
  saveStyle,
  getStyle,
  setStyleEnabled,
  deleteStyle,
  updateScript,
  reviseShot,
  type ShotEdit,
  askTopicAssistant,
  newTopicConversation,
  saveTopicDraft,
  isTopicDraft,
  type TopicReply,
  type Message,
  askPromptAssistant,
  newPromptConversation,
  saveRequirementDraft,
  env,
} from "@paper/core";
import { encodeWav, synthesizeMusic } from "@paper/video/music";
import { requireAuth } from "@/lib/auth";
import { FONT_KEYS, FONT_STACKS } from "@/lib/fonts";
import type { StyleTokens } from "@paper/video/theme";

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
    description: str(f, "description").slice(0, 200),
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
  const styleId = optId(f, "styleId");
  const parsed = videoSchema.safeParse({
    ...getSetting("video"),
    enabled: bool(f, "enabled"),
    musicMode: str(f, "musicMode"),
    musicVolume: num(f, "musicVolume") / 100,
    readingSpeed: num(f, "readingSpeed"),
    styleMode: str(f, "styleMode") === "fixed" && styleId ? "fixed" : "auto",
    styleId,
    narration: { enabled: bool(f, "narration"), providerId: optId(f, "narrationProvider"), model: str(f, "narrationModel"), voice: str(f, "narrationVoice"), speed: num(f, "narrationSpeed") || 1 },
  });
  if (!parsed.success) back("/admin/video?tab=settings", "参数无效");
  if (parsed.data.narration.enabled && (!parsed.data.narration.providerId || !parsed.data.narration.model)) back("/admin/video?tab=settings", "开启旁白需要选择服务商并填写模型");
  setSetting("video", parsed.data);
  back("/admin/video?tab=settings", "已保存");
}

// ---------- 解读 ----------

const selectedIds = (f: FormData) => f.getAll("ids").map(Number).filter(Number.isSafeInteger);
/** 操作后回到原列表（保留筛选与分页） */
const listBack = (f: FormData) => (str(f, "back").startsWith("/admin/digests") ? str(f, "back") : "/admin/digests");

function selectedDigests(f: FormData) {
  const ids = selectedIds(f);
  const rows = ids.length ? db.select({ id: schema.digests.id, paperId: schema.digests.paperId }).from(schema.digests).where(inArray(schema.digests.id, ids)).all() : [];
  if (!rows.length) back(listBack(f), "请先选择解读");
  return rows;
}

export async function regenerateDigests(f: FormData) {
  await requireAuth();
  const issue = configurationIssue(); if (issue) back("/admin/models", issue);
  const id = enqueueRun("digest", "manual", { paperIds: selectedDigests(f).map((d) => d.paperId) });
  redirect(`/admin/runs/${id}`);
}

export async function rerenderVideos(f: FormData) {
  await requireAuth();
  const issue = configurationIssue(); if (issue) back("/admin/models", issue);
  const runs = selectedDigests(f).map((d) => enqueueRun("digest", "manual", { videoDigestId: d.id }));
  if (runs.length === 1) redirect(`/admin/runs/${runs[0]}`);
  back("/admin", `已加入 ${runs.length} 次运行`);
}

export async function removeDigests(f: FormData) {
  await requireAuth();
  const rows = selectedDigests(f);
  let n: number;
  try {
    n = deleteDigests(rows.map((d) => d.id));
  } catch (e) {
    back(listBack(f), e instanceof Error ? e.message : String(e));
  }
  back(listBack(f), `已删除 ${n} 篇`);
}

// ---------- 视频与音乐 ----------

const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".ogg"];

export async function uploadMusic(f: FormData) {
  await requireAuth();
  const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) back("/admin/video?tab=settings", "请选择音乐文件");
  fs.mkdirSync(dataPath("music"), { recursive: true });
  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    if (!AUDIO_EXT.includes(ext)) back("/admin/video?tab=settings", `不支持的格式：${file.name}`);
    const rel = `music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    fs.writeFileSync(dataPath(rel), Buffer.from(await file.arrayBuffer()));
    db.insert(schema.musicTracks).values({ name: path.basename(file.name, ext), path: rel }).run();
  }
  back("/admin/video?tab=settings", `已上传 ${files.length} 首`);
}

export async function deleteMusic(f: FormData) {
  await requireAuth();
  const t = db.select().from(schema.musicTracks).where(eq(schema.musicTracks.id, num(f, "id"))).get();
  if (t) {
    fs.rmSync(dataPath(t.path), { force: true });
    db.delete(schema.musicTracks).where(eq(schema.musicTracks.id, t.id)).run();
  }
  back("/admin/video?tab=settings", "已删除");
}

/** 生成一段 30 秒的程序化音乐试听 */
export async function previewMusic() {
  await requireAuth();
  const seed = Math.floor(Math.random() * 1e6);
  fs.mkdirSync(dataPath("music"), { recursive: true });
  fs.writeFileSync(dataPath("music", "preview.wav"), encodeWav(synthesizeMusic(30, seed)));
  back("/admin/video?tab=settings", `已生成试听（seed ${seed}）`);
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
      title: `${SITE_NAME} · 测试消息`,
      items: [{ title: "通知渠道配置成功", summary: `以后「${c.events.map((e) => EVENT_LABELS[e]).join("、")}」会推送到这里。`, url: env.siteUrl }],
    });
    msg = "已保存，测试消息已发送";
  } catch (e) {
    msg = `已保存，但发送失败：${String(e).slice(0, 300)}`;
  }
  back(editHref(id), msg);
}

// ---------- 提示词（写作要求） ----------

const promptsHref = (stage: string, v?: number) => `/admin/prompts?stage=${stage}${v ? `&v=${v}` : ""}`;

export async function saveRequirement(f: FormData) {
  await requireAuth();
  const stage = str(f, "stage") as RequirementStage;
  if (!(REQUIREMENT_STAGES as readonly string[]).includes(stage)) back("/admin/prompts", "环节无效");
  let id: number;
  try {
    id = saveRequirementVersion(stage, String(f.get("content") ?? ""), str(f, "note")).id;
  } catch (e) {
    back(promptsHref(stage, optId(f, "from") ?? undefined), e instanceof Error ? e.message : String(e));
  }
  back(promptsHref(stage, id), "已保存为新版本");
}

export async function activateRequirement(f: FormData) {
  await requireAuth();
  const v = activateRequirementVersion(num(f, "id"));
  back(str(f, "back").startsWith("/admin/") ? str(f, "back") : promptsHref(v.stage, v.id), `已启用 v${v.number}`);
}

export async function adoptTrial(f: FormData) {
  await requireAuth();
  const trialId = num(f, "id");
  try {
    adoptDigestTrial(trialId);
  } catch (e) {
    back(`/admin/prompts/trials/${trialId}`, e instanceof Error ? e.message : String(e));
  }
  back(`/admin/prompts/trials/${trialId}`, "已采用这次解读；写作要求及已有视频保持原状");
}

export async function startTrial(f: FormData) {
  await requireAuth();
  const versionId = num(f, "id");
  const v = getRequirementVersion(versionId);
  if (!v) back("/admin/prompts", "版本不存在");
  const issue = configurationIssue(); if (issue) back("/admin/models", issue);
  try {
    enqueueTrial(versionId, str(f, "target"));
  } catch (e) {
    back(promptsHref(v.stage, versionId), e instanceof Error ? e.message : String(e));
  }
  back(promptsHref(v.stage, versionId), "已开始试写，完成后可对比");
}

export async function activateRevision(f: FormData) {
  await requireAuth();
  const digestId = num(f, "digestId");
  activateDigestRevision(digestId, num(f, "revisionId"));
  back(`/admin/digests/${digestId}`, "已切换生效的修订");
}

// ---------- 方向助手 ----------

/** 和方向助手说一句话：返回新增的两条消息（回复里可能带草稿与试选结果） */
export async function askTopicAction(text: string, conversationId?: number): Promise<{ conversationId?: number; messages?: TopicReply[]; error?: string }> {
  await requireAuth();
  try {
    return await askTopicAssistant(text.slice(0, 4000), conversationId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function newTopicChatAction() {
  await requireAuth();
  return newTopicConversation();
}

/** 保存助手消息里的草稿为方向（同名则更新） */
export async function saveTopicDraftAction(messageId: number) {
  await requireAuth();
  const m = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get();
  if (!m || !isTopicDraft(m.data)) return { error: "草稿不存在" };
  const r = saveTopicDraft(m.data);
  revalidatePath("/admin/selection");
  return { ok: r.updated ? `已更新「${m.data.name}」` : `已添加「${m.data.name}」` };
}

// ---------- 视频风格 ----------

const styleHref = (id?: number) => `/admin/video${id ? `?style=${id}` : ""}`;
const COLOR = /^#[0-9a-f]{6}$|^rgba?\([\d.,\s%]+\)$/i;

export async function saveStyleAction(f: FormData) {
  await requireAuth();
  const id = optId(f, "id");
  const colors = Object.fromEntries(["bg", "bg2", "surface", "border", "text", "muted", "primary", "accent"].map((k) => [k, str(f, `color_${k}`)]));
  if (Object.values(colors).some((c) => !COLOR.test(c))) back(styleHref(id ?? undefined), "颜色格式无效");
  const pick = <T extends string>(v: string, ok: readonly T[], d: T) => (ok.includes(v as T) ? (v as T) : d);
  const tokens: StyleTokens = {
    colors: colors as StyleTokens["colors"],
    fonts: { heading: FONT_STACKS[pick(str(f, "fontHeading"), FONT_KEYS, "sans")], body: FONT_STACKS[pick(str(f, "fontBody"), FONT_KEYS, "sans")] },
    background: pick(str(f, "background"), ["aurora", "grid", "plain", "paper"] as const, "plain"),
    transition: pick(str(f, "transition"), ["fade", "slide", "cut"] as const, "fade"),
    subtitle: pick(str(f, "subtitle"), ["dark", "light"] as const, "dark"),
  };
  const saved = saveStyle({ name: str(f, "name"), description: str(f, "description"), guide: String(f.get("guide") ?? ""), tokens }, id ?? undefined);
  back(styleHref(saved), "已保存");
}

export async function copyStyleAction(f: FormData) {
  await requireAuth();
  const s = getStyle(num(f, "id"));
  if (!s) back("/admin/video", "风格不存在");
  const id = saveStyle({ name: `${s.name}（副本）`, description: s.description, guide: s.guide, tokens: s.tokens });
  back(styleHref(id), "已复制");
}

export async function toggleStyleAction(f: FormData) {
  await requireAuth();
  setStyleEnabled(num(f, "id"), bool(f, "enabled"));
  back("/admin/video", bool(f, "enabled") ? "已启用" : "已停用");
}

export async function deleteStyleAction(f: FormData) {
  await requireAuth();
  try {
    deleteStyle(num(f, "id"));
  } catch (e) {
    back(styleHref(num(f, "id")), e instanceof Error ? e.message : String(e));
  }
  back("/admin/video", "已删除");
}

export async function makeSampleAction(f: FormData) {
  await requireAuth();
  const issue = configurationIssue(); if (issue) back("/admin/models", issue);
  const id = enqueueRun("sample", "manual", { styleId: num(f, "id") });
  redirect(`/admin/runs/${id}`);
}

// ---------- 讲解脚本 ----------

/** 保存后台编辑的讲解脚本（客户端调用） */
export async function saveScriptAction(digestId: number, edit: { title: string; styleId: number | null; shots: ShotEdit[] }) {
  await requireAuth();
  try {
    // 编辑器直接用返回的脚本更新界面，不刷新页面（否则会重建编辑器、丢掉提示）
    return { script: updateScript(digestId, edit) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 让大模型按意见修改一个镜头的代码 */
export async function reviseShotAction(digestId: number, shotId: string, instruction: string) {
  await requireAuth();
  try {
    return { shot: await reviseShot(digestId, shotId, instruction.slice(0, 2000)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 按当前讲解脚本重新生成视频：只重写改过的镜头代码 */
export async function regenerateFromScript(f: FormData) {
  await requireAuth();
  const issue = configurationIssue(); if (issue) back("/admin/models", issue);
  const id = enqueueRun("digest", "manual", { videoDigestId: num(f, "digestId"), reuseScript: true });
  redirect(`/admin/runs/${id}`);
}

// ---------- 提示词助手 ----------

const asStage = (s: string) => ((REQUIREMENT_STAGES as readonly string[]).includes(s) ? (s as RequirementStage) : null);

export async function askPromptAction(stage: string, versionId: number, text: string, conversationId?: number): Promise<{ conversationId?: number; messages?: Message[]; error?: string }> {
  await requireAuth();
  const st = asStage(stage);
  if (!st) return { error: "环节无效" };
  try {
    return await askPromptAssistant(st, versionId, text.slice(0, 4000), conversationId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function newPromptChatAction(stage: string) {
  await requireAuth();
  const st = asStage(stage);
  if (!st) throw new Error("环节无效");
  return newPromptConversation(st);
}

export async function saveRequirementDraftAction(messageId: number): Promise<{ id?: number; error?: string }> {
  await requireAuth();
  try {
    const v = saveRequirementDraft(messageId);
    revalidatePath("/admin/prompts");
    return { id: v.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

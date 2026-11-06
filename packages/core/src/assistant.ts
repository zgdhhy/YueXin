import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { RequirementDraft, TopicDraft } from "./db/schema";
import { cachedPaperText } from "./pipeline/fetchPaper";
import { getWholeNote, saveWholeNote } from "./library";
import { generateJson, llmForStage, llmForReadingModel } from "./llm";
import { PAPER_QA_SYSTEM, PROMPT_ASSISTANT_SYSTEM, TOPIC_ASSISTANT_SYSTEM, READING_CONVERSATION_TITLE_SYSTEM, paperQaPrompt, promptAssistantPrompt, topicAssistantPrompt } from "./prompts/assistant";
import { getRequirementVersion, saveRequirementVersion, type RequirementStage } from "./requirements";
import { STAGE_NAMES } from "./model-policy";
import { getReadingDocument } from "./reading-document";
import { REPORT_QA_SYSTEM, reportQaPrompt } from "./prompts/assistant";
import { listTopics, preferenceSamples, topicMatches, type TopicMatch } from "./topics";

/**
 * 助手（对话环节）：方向助手与论文追问。
 * 它们在 web 进程里直接调用大模型（不经过运行队列），用量记入 llm_calls，环节为 chat。
 */
export type Message = typeof schema.messages.$inferSelect;
export type ChatKind = (typeof schema.conversations.$inferSelect)["kind"];

/** 论文追问每轮带上的原文长度上限 */
const PAPER_CONTEXT_CHARS = 80_000;
/** 每轮带上的历史消息条数 */
const HISTORY_MESSAGES = 12;

function conversationFor(kind: ChatKind, subject: string | null, create: boolean) {
  const found = db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.kind, kind), subject == null ? undefined : eq(schema.conversations.subject, subject)))
    .orderBy(desc(schema.conversations.id))
    .get();
  if (found || !create) return found;
  return db.insert(schema.conversations).values({ kind, subject }).returning().get();
}

export function listMessages(conversationId: number): Message[] {
  return db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.id)).all();
}

/** 最近一次方向助手对话（没有时为空） */
export function topicConversation() {
  const c = conversationFor("topic", null, false);
  return c ? { id: c.id, messages: listMessages(c.id) } : null;
}

export function newTopicConversation() {
  return db.insert(schema.conversations).values({ kind: "topic" }).returning().get().id;
}

/** 某篇论文的追问记录 */
export function paperConversation(paperId: string) {
  const c = conversationFor("paper", paperId, false);
  return c ? listMessages(c.id) : [];
}

function ownedPaperConversation(paperId: string, id: number) {
  const c = db.select().from(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.kind, "paper"), eq(schema.conversations.subject, paperId))).get();
  if (!c) throw new Error("对话不存在或不属于当前解读，请刷新会话列表");
  return c;
}

export function listPaperConversations(paperId: string) {
  const conversations = db.select().from(schema.conversations).where(and(eq(schema.conversations.kind, "paper"), eq(schema.conversations.subject, paperId))).all();
  const messages = conversations.length ? db.select().from(schema.messages).where(inArray(schema.messages.conversationId, conversations.map(c => c.id))).orderBy(asc(schema.messages.id)).all() : [];
  return conversations.map(c => {
    const own = messages.filter(m => m.conversationId === c.id);
    return { id: c.id, title: c.title || "新对话", createdAt: c.createdAt, updatedAt: own.at(-1)?.createdAt ?? c.createdAt, messageCount: own.length };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
}
export type PaperConversationSummary = ReturnType<typeof listPaperConversations>[number];
export type ReadingConversationSummary = PaperConversationSummary;
// Compatibility names remain available; the reader API also accepts report:YYYY-MM subjects.
export { askPaper as askReading, listPaperConversations as listReadingConversations, getPaperConversation as getReadingConversation, newPaperConversation as newReadingConversation };

export function getPaperConversation(paperId: string, id: number) {
  const c = ownedPaperConversation(paperId, id);
  return { id: c.id, messages: listMessages(c.id) };
}

export function newPaperConversation(paperId: string) {
  if (!getReadingDocument(paperId)) throw new Error("解读不存在");
  return db.insert(schema.conversations).values({ kind: "paper", subject: paperId }).returning().get().id;
}

export function renamePaperConversation(paperId: string, id: number, title: string) {
  ownedPaperConversation(paperId, id);
  const text = title.trim().slice(0, 80);
  if (!text) throw new Error("请输入对话名称");
  db.update(schema.conversations).set({ title: text }).where(eq(schema.conversations.id, id)).run();
}

export function deletePaperConversation(paperId: string, id: number) {
  ownedPaperConversation(paperId, id);
  db.transaction(tx => {
    tx.delete(schema.messages).where(eq(schema.messages.conversationId, id)).run();
    tx.delete(schema.conversations).where(eq(schema.conversations.id, id)).run();
  });
}

function addMessage(conversationId: number, role: Message["role"], content: string, data: TopicDraft | RequirementDraft | null = null) {
  return db.insert(schema.messages).values({ conversationId, role, content, data }).returning().get();
}

/** 模型调用失败时撤回刚记下的提问，避免留下没有回答的消息 */
async function undoOnError<T>(user: Message, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    db.delete(schema.messages).where(eq(schema.messages.id, user.id)).run();
    throw e;
  }
}

const transcript = (list: Message[], user: string) =>
  list
    .slice(-HISTORY_MESSAGES)
    .map((m) => `${m.role === "user" ? user : "助手"}：${m.content}`)
    .join("\n\n");

const draftSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  arxivCategories: z.array(z.string()),
  keywords: z.array(z.string()).min(1),
  weight: z.number(),
});
const topicReplySchema = z.object({ reply: z.string().min(1), draft: draftSchema.nullable() });

export type TopicReply = Message & { matches?: { total: number; top: TopicMatch[] } };

export const isTopicDraft = (d: Message["data"]): d is TopicDraft => !!d && "keywords" in d;

/** 方向草稿的试选：用近期采集到的论文看它会命中哪些 */
export function withMatches(m: Message): TopicReply {
  return isTopicDraft(m.data) ? { ...m, matches: topicMatches(m.data) } : m;
}

/** 和方向助手说一句话；没有对话时自动新建 */
export async function askTopicAssistant(text: string, conversationId?: number): Promise<{ conversationId: number; messages: TopicReply[] }> {
  const message = text.trim();
  if (!message) throw new Error("请输入内容");
  const id = conversationId ?? conversationFor("topic", null, true)!.id;
  const history = listMessages(id);
  const topics = listTopics()
    .map((t) => `- ${t.name}${t.enabled ? "" : "（已停用）"}：${t.description || "无描述"}；分类 ${t.arxivCategories.join(", ")}；关键词 ${t.keywords.join(", ")}；权重 ${t.weight}`)
    .join("\n");
  const feedback = preferenceSamples();
  const lines = (l: { title: string }[]) => l.map((p) => `- ${p.title}`).join("\n");
  const user = addMessage(id, "user", message);
  const reply = await undoOnError(user, () =>
    generateJson(
      llmForStage("chat"),
      { system: TOPIC_ASSISTANT_SYSTEM, prompt: topicAssistantPrompt({ topics, liked: lines(feedback.liked), disliked: lines(feedback.disliked), history: transcript(history, "读者"), message }) },
      topicReplySchema,
    ),
  );
  const answer = addMessage(id, "assistant", reply.reply, reply.draft);
  return { conversationId: id, messages: [user, withMatches(answer)] };
}

/** 就一篇论文追问；记录保存在该论文的对话里 */
export async function askPaper(paperId: string, question: string, conversationId?: number, modelRefId?: number | null, onText?: (delta: string, reset?: boolean) => void): Promise<Message[]> {
  const q = question.trim();
  if (!q) throw new Error("请输入问题");
  const d = getReadingDocument(paperId);
  if (!d) throw new Error("解读不存在");
  const conv = conversationId == null ? conversationFor("paper", paperId, true)! : ownedPaperConversation(paperId, conversationId);
  const history = listMessages(conv.id);
  const user = addMessage(conv.id, "user", q);
  const answer = await undoOnError(user, () =>
    (modelRefId == null ? llmForStage("chat") : llmForReadingModel(modelRefId)).generate({
      onText,
      system: d.kind === "report" ? REPORT_QA_SYSTEM : PAPER_QA_SYSTEM,
      prompt: d.kind === "report" ? reportQaPrompt({ title: d.title, content: d.contentMd, history: transcript(history, "读者"), question: q })
        : paperQaPrompt({ title: `${d.title}（${d.originalTitle}）`, digest: d.contentMd, paper: cachedPaperText(paperId, PAPER_CONTEXT_CHARS), history: transcript(history, "读者"), question: q }),
    }),
  );
  // 其他标签页可能在请求期间删除了会话；不能写出孤立回答。
  ownedPaperConversation(paperId, conv.id);
  const reply = addMessage(conv.id, "assistant", answer.trim());
  if (!ownedPaperConversation(paperId, conv.id).title) {
    // The answer is already saved. Naming failures must never undo it or trigger a resend.
    try {
      const options = { maxTokens: 512, effort: "low" as const };
      const model = modelRefId == null ? llmForStage("chat", options) : llmForReadingModel(modelRefId, options);
      const questions = [...history, user].filter(message => message.role === "user").slice(0, 3).map((message, index) => `${index + 1}. ${message.content.slice(0, 2000)}`).join("\n\n");
      const generated = await model.generate({ system: READING_CONVERSATION_TITLE_SYSTEM, prompt: `## 用户问题（命名的主要依据，按提问顺序）\n${questions}\n\n## 回答（仅辅助理解问题，不作为标题结论）\n${reply.content.slice(0, 800)}\n\n## 阅读主题（仅背景）\n${d.title.slice(0, 200)}` });
      const title = generated.trim().replace(/^[“「"'`]+|[”」"'`]+$/g, "");
      if (title.length >= 2 && title.length <= 20 && !/[\r\n]/.test(title) && title.replace(/[\s？?。！!]/g, "") !== q.replace(/[\s？?。！!]/g, "")) {
        // Another tab may rename/delete the conversation while the model is working.
        db.update(schema.conversations).set({ title }).where(and(eq(schema.conversations.id, conv.id), isNull(schema.conversations.title))).run();
      }
    } catch { /* Keep “新对话”; retry naming after the next successful answer. */ }
  }
  return [user, reply];
}

/** 把一条追问的回答连同问题追加到整篇笔记 */
export function saveAnswerAsNote(paperId: string, messageId: number) {
  const answer = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get();
  if (!answer || answer.role !== "assistant") throw new Error("回答不存在");
  ownedPaperConversation(paperId, answer.conversationId);
  const list = listMessages(answer.conversationId);
  const i = list.findIndex((m) => m.id === messageId && m.role === "assistant");
  if (i < 0) throw new Error("回答不存在");
  const question = list.slice(0, i).reverse().find((m) => m.role === "user")?.content;
  const existing = getWholeNote(paperId);
  const block = `${question ? `问：${question}\n` : ""}答：${list[i].content}`;
  saveWholeNote(paperId, existing ? `${existing}\n\n${block}` : block);
  return getWholeNote(paperId);
}

// ---------- 提示词助手 ----------

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 某个环节最近的产出（节选），帮助助手判断写作要求哪里需要调整 */
function recentOutputs(stage: RequirementStage): string {
  if (stage === "rerank") {
    return db
      .select({ title: schema.papers.title, role: schema.candidates.role, reason: schema.candidates.reason })
      .from(schema.candidates)
      .innerJoin(schema.papers, eq(schema.papers.id, schema.candidates.paperId))
      .orderBy(desc(schema.candidates.id))
      .limit(40)
      .all()
      .filter((c) => c.role)
      .slice(0, 10)
      .map((c) => `- ${c.role === "pick" ? "推荐" : "备选"}《${c.title}》：${c.reason ?? ""}`)
      .join("\n");
  }
  if (stage === "digest") {
    return db.select().from(schema.digests).orderBy(desc(schema.digests.createdAt)).limit(2).all().map((d) => `### ${d.titleZh}\n${cut(d.contentMd, 2500)}`).join("\n\n");
  }
  if (stage === "storyboard" || stage === "code") {
    const scripts = db.select().from(schema.explainerScripts).orderBy(desc(schema.explainerScripts.updatedAt)).limit(stage === "code" ? 1 : 2).all();
    return scripts
      .map((s) =>
        stage === "storyboard"
          ? `### ${s.title}\n${s.shots.map((x, i) => `${i + 1}. ${x.heading}：${x.visual}\n   字幕：${x.cues.map((c) => c.zh).join(" / ")}`).join("\n")}`
          : s.shots
              .slice(0, 3)
              .map((x, i) => `### 镜头 ${i + 1}「${x.heading}」${x.codeError ? `（${x.codeError}）` : ""}\n${cut(x.code ?? "（没有代码）", 1500)}`)
              .join("\n\n"),
      )
      .join("\n\n");
  }
  const r = db.select().from(schema.trendReports).orderBy(desc(schema.trendReports.month)).get();
  return r ? `### ${r.title}\n${cut(r.contentMd, 3000)}` : "";
}

const promptReplySchema = z.object({ reply: z.string().min(1), draft: z.string().nullable(), note: z.string().nullable().optional() });

/** 某个环节最近一次提示词助手对话 */
export function promptConversation(stage: RequirementStage) {
  const c = conversationFor("prompt", stage, false);
  return c ? { id: c.id, messages: listMessages(c.id) } : null;
}

export function newPromptConversation(stage: RequirementStage) {
  return db.insert(schema.conversations).values({ kind: "prompt", subject: stage }).returning().get().id;
}

/** 和提示词助手说一句话；versionId 是读者正在看的版本，草稿以它为基础 */
export async function askPromptAssistant(stage: RequirementStage, versionId: number, text: string, conversationId?: number): Promise<{ conversationId: number; messages: Message[] }> {
  const message = text.trim();
  if (!message) throw new Error("请输入内容");
  const base = getRequirementVersion(versionId);
  if (!base || base.stage !== stage) throw new Error("版本不存在");
  const id = conversationId ?? conversationFor("prompt", stage, true)!.id;
  const history = listMessages(id);
  const feedback = preferenceSamples();
  const lines = (l: { title: string }[]) => l.map((p) => `- ${p.title}`).join("\n");
  const user = addMessage(id, "user", message);
  const reply = await undoOnError(user, () =>
    generateJson(
      llmForStage("chat"),
      {
        system: PROMPT_ASSISTANT_SYSTEM,
        prompt: promptAssistantPrompt({ stage: STAGE_NAMES[stage], current: base.content, outputs: recentOutputs(stage), liked: lines(feedback.liked), disliked: lines(feedback.disliked), history: transcript(history, "读者"), message }),
      },
      promptReplySchema,
    ),
  );
  const draft = reply.draft?.trim() && reply.draft.trim() !== base.content.trim() ? { content: reply.draft.trim(), note: reply.note?.trim() || "提示词助手修改", baseVersionId: base.id } : null;
  return { conversationId: id, messages: [user, addMessage(id, "assistant", reply.reply, draft)] };
}

/** 把助手消息里的写作要求草稿保存为新版本（不自动启用） */
export function saveRequirementDraft(messageId: number) {
  const m = db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).get();
  const draft = m?.data && "content" in m.data ? m.data : null;
  const base = draft ? getRequirementVersion(draft.baseVersionId) : undefined;
  if (!draft || !base) throw new Error("草稿不存在");
  return saveRequirementVersion(base.stage, draft.content, draft.note);
}

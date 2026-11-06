import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

const createdAt = (name = "created_at") =>
  text(name)
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

/** 订阅登录（OAuth）的令牌与进行中的登录 */
export interface OAuthState {
  access?: string;
  refresh?: string;
  /** 访问令牌过期时间（毫秒时间戳） */
  expires?: number;
  accountId?: string;
  email?: string;
  plan?: string;
  /** 进行中的登录：浏览器登录存 PKCE，设备码登录存设备码 */
  pending?:
    | { method: "browser"; verifier: string; state: string; url: string; startedAt: number }
    | { method: "device"; deviceAuthId: string; userCode: string; interval: number; startedAt: number };
}

/** 全局配置，key → JSON */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

/** 服务商：一组连接凭证，下面挂多个模型 */
export const llmProviders = sqliteTable("llm_providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** 预设模板 id（如 anthropic / deepseek），自定义为 custom */
  preset: text("preset").notNull().default("custom"),
  /** 图标 id（见 llm/icons.ts）；为空时按预设或地址自动选择 */
  icon: text("icon"),
  /** codex：ChatGPT 订阅（Codex Responses 接口），需 OAuth 登录 */
  protocol: text("protocol", { enum: ["anthropic", "openai", "responses", "gemini", "codex"] }).notNull(),
  baseUrl: text("base_url"),
  options: text("options", { mode: "json" }).$type<import("../llm/connection").ProviderOptions>(),
  /** 认证方式：api_key 用 apiKey；oauth 用 oauth 中的令牌（订阅登录） */
  authType: text("auth_type", { enum: ["api_key", "oauth"] }).notNull().default("api_key"),
  /** API Key；OAuth 服务商与本地服务（如 Ollama）可为空串 */
  apiKey: text("api_key").notNull(),
  /** OAuth 令牌与进行中的登录，见 llm/oauth.ts */
  oauth: text("oauth", { mode: "json" }).$type<OAuthState>(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

/** 服务商下可用的模型 */
export const llmModels = sqliteTable(
  "llm_models",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id").notNull(),
    /** 调用 API 时使用的模型 id */
    modelId: text("model_id").notNull(),
    /** 本地模型名称与实际发给上游的模型 ID 可分别设置。 */
    upstreamModelId: text("upstream_model_id"),
    contextWindow: integer("context_window"),
    displayName: text("display_name"),
    /** 每次请求的最大输出 tokens */
    maxOutputTokens: integer("max_output_tokens").notNull().default(32000),
    /** 思考强度（low…max），只对支持 effort 的 Claude 模型生效；为空用模型默认 */
    effort: text("effort", { enum: ["low", "medium", "high", "xhigh", "max"] }),
    /** 价格：美元 / 百万 tokens，用于估算费用 */
    priceInput: real("price_input"),
    priceOutput: real("price_output"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("llm_models_provider_model").on(t.providerId, t.modelId)],
);

/** 每一次大模型调用的记录：用量、耗时、费用与错误 */
export const llmCalls = sqliteTable("llm_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id"),
  stage: text("stage").notNull(),
  modelRefId: integer("model_ref_id"),
  /** 冗余保存，模型被删除后记录仍可读 */
  providerName: text("provider_name").notNull(),
  modelId: text("model_id").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd"),
  latencyMs: integer("latency_ms").notNull(),
  status: text("status", { enum: ["ok", "error"] }).notNull(),
  /** 是否为主模型失败后的备用模型调用 */
  isFallback: integer("is_fallback", { mode: "boolean" }).notNull().default(false),
  error: text("error"),
  createdAt: createdAt(),
});

export const schedules = sqliteTable("schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["digest", "trend_report"] }).notNull().default("digest"),
  cron: text("cron").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  picksPerRun: integer("picks_per_run").notNull().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** 一句话描述读者关心什么；交给大模型精选参考 */
  description: text("description").notNull().default(""),
  arxivCategories: text("arxiv_categories", { mode: "json" }).$type<string[]>().notNull(),
  keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull(),
  weight: real("weight").notNull().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const papers = sqliteTable("papers", {
  id: text("id").primaryKey(), // arXiv id, e.g. 2610.22444
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  authors: text("authors", { mode: "json" }).$type<string[]>().notNull(),
  organization: text("organization"),
  publishedAt: text("published_at").notNull(),
  upvotes: integer("upvotes").notNull().default(0),
  citations: integer("citations"),
  keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull().default([]),
  arxivCategories: text("arxiv_categories", { mode: "json" }).$type<string[]>().notNull().default([]),
  githubUrl: text("github_url"),
  createdAt: createdAt(),
});

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** trial：用某个写作要求版本试写，结果只进 trials 表；sample：为视频风格渲染样片；reference：分析参考视频生成风格 */
  kind: text("kind", { enum: ["digest", "trend_report", "trial", "sample", "reference"] }).notNull(),
  trigger: text("trigger", { enum: ["schedule", "manual"] }).notNull(),
  scheduleId: integer("schedule_id"),
  /** 手动指定论文时使用 */
  params: text("params", { mode: "json" }).$type<RunParams>().notNull().default({}),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull().default("queued"),
  error: text("error"),
  createdAt: createdAt(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export type RunParams = {
  picks?: number;
  paperIds?: string[];
  month?: string;
  videoDigestId?: number;
  /** 重做视频时沿用已有讲解脚本，只重写改过的镜头代码再渲染 */
  reuseScript?: boolean;
  /** 重做视频时临时指定的视频风格；样片运行的风格 */
  styleId?: number;
  /** 参考视频（相对 DATA_DIR），分析完即删除 */
  referencePath?: string;
  /** 试写：环节、写作要求版本与对象（论文解读为 arXiv id，讲解脚本为解读 id，趋势月报为月份） */
  trial?: { stage: import("../requirements").RequirementStage; versionId: number; target: string };
  modelSnapshot?: import("../model-policy").RunModelSnapshot;
  /** 运行认领时锁定的各环节写作要求版本 */
  requirements?: Partial<Record<import("../requirements").RequirementStage, number>>;
};

export const runSteps = sqliteTable("run_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  name: text("name").notNull(),
  paperId: text("paper_id"),
  status: text("status", { enum: ["running", "succeeded", "failed", "skipped"] }).notNull(),
  log: text("log").notNull().default(""),
  startedAt: createdAt(),
  finishedAt: text("finished_at"),
});

export const candidates = sqliteTable("candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  paperId: text("paper_id").notNull(),
  notable: integer("notable", { mode: "boolean" }).notNull().default(false),
  ruleScore: real("rule_score").notNull(),
  role: text("role", { enum: ["pick", "alternate"] }),
  reason: text("reason"),
});

export const figures = sqliteTable(
  "figures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paperId: text("paper_id").notNull(),
    label: text("label").notNull(), // e.g. "Figure 1"
    caption: text("caption").notNull(),
    /** 相对 DATA_DIR 的路径 */
    path: text("path").notNull(),
    width: integer("width"),
    height: integer("height"),
  },
  (t) => [uniqueIndex("figures_paper_label").on(t.paperId, t.label)],
);

export const digests = sqliteTable("digests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id").notNull().unique(),
  runId: integer("run_id").notNull(),
  titleZh: text("title_zh").notNull(),
  oneLiner: text("one_liner").notNull(),
  contentMd: text("content_md").notNull(),
  notable: integer("notable", { mode: "boolean" }).notNull().default(false),
  pickReason: text("pick_reason"),
  /** 当前生效的解读修订；正文等字段是它的副本 */
  revisionId: integer("revision_id"),
  createdAt: createdAt(),
});

/** 解读修订：每次（重新）解读产生一版，旧版保留以便对比和切换 */
export const digestRevisions = sqliteTable("digest_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  digestId: integer("digest_id").notNull(),
  runId: integer("run_id").notNull(),
  titleZh: text("title_zh").notNull(),
  oneLiner: text("one_liner").notNull(),
  contentMd: text("content_md").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** 生成时使用的写作要求版本；升级前的旧解读为空 */
  requirementsVersionId: integer("requirements_version_id"),
  createdAt: createdAt(),
});

/** 写作要求版本：每个环节同时只有一个启用；内容保存后不再修改 */
export const requirementVersions = sqliteTable("requirement_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stage: text("stage", { enum: ["rerank", "digest", "storyboard", "code", "report"] }).notNull(),
  number: integer("number").notNull(),
  content: text("content").notNull(),
  note: text("note").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("requirement_versions_stage_number").on(t.stage, t.number)]);

/** 试写结果：不对读者展示，只用于与当前启用版本的产出对比 */
export const trials = sqliteTable("trials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  stage: text("stage", { enum: ["rerank", "digest", "storyboard", "code", "report"] }).notNull(),
  versionId: integer("version_id").notNull(),
  target: text("target").notNull(),
  output: text("output", { mode: "json" }).notNull(),
  createdAt: createdAt(),
});

/**
 * 视频风格：tokens 交给渲染框架（配色、字体、背景、转场、字幕），guide 交给写脚本与写代码的大模型
 * （叙事口吻、画面要点、禁忌）。slug 非空的是内置风格。
 */
export const videoStyles = sqliteTable("video_styles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  /** 适合什么样的论文；自动选风格时交给大模型 */
  description: text("description").notNull().default(""),
  guide: text("guide").notNull().default(""),
  tokens: text("tokens", { mode: "json" }).$type<import("@paper/video/theme").StyleTokens>().notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** 样片（相对 DATA_DIR） */
  samplePath: text("sample_path"),
  createdAt: createdAt(),
});

/** 讲解脚本中的一个镜头：文案 + 画面说明 + 动画代码 */
export type StoredShot = {
  id: string;
  heading: string;
  visual: string;
  cues: { zh: string; en: string }[];
  /** 模型写的 TSX；为空表示还没写或需要重写 */
  code: string | null;
  /** 编译或渲染失败的原因；有值时渲染为简单画面 */
  codeError: string | null;
  /** 最近一次渲染的缩略图（相对 DATA_DIR） */
  thumb: string | null;
};

/** 讲解脚本：一篇解读一份，可在后台编辑；重做视频时只重写改过的镜头 */
export const explainerScripts = sqliteTable("explainer_scripts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  digestId: integer("digest_id").notNull().unique(),
  styleId: integer("style_id"),
  /** 自动选择风格时，大模型给出的理由 */
  styleReason: text("style_reason"),
  title: text("title").notNull(),
  shots: text("shots", { mode: "json" }).$type<StoredShot[]>().notNull(),
  requirementsVersionId: integer("requirements_version_id"),
  createdAt: createdAt(),
  updatedAt: createdAt("updated_at"),
});

/** 助手对话：topic 为方向助手（不绑定对象），paper 为论文追问（subject 为 arXiv id），prompt 为提示词助手（subject 为环节） */
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["topic", "paper", "prompt"] }).notNull(),
  subject: text("subject"),
  /** 阅读对话的 AI 摘要名称或手动名称；为空时显示「新对话」 */
  title: text("title"),
  createdAt: createdAt(),
});

/** 对话消息；方向助手的回复可附带主题草稿，提示词助手的回复可附带写作要求草稿（data） */
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  data: text("data", { mode: "json" }).$type<TopicDraft | RequirementDraft | null>(),
  createdAt: createdAt(),
});

export type TopicDraft = { name: string; description: string; arxivCategories: string[]; keywords: string[]; weight: number };
/** 提示词助手给出的完整写作要求草稿；baseVersionId 是对话时正在看的版本 */
export type RequirementDraft = { content: string; note: string; baseVersionId: number };

/** 读者对一篇论文的标记；按论文记录，删除解读后仍保留，作为选题反馈 */
export const paperMarks = sqliteTable("paper_marks", {
  paperId: text("paper_id").primaryKey(),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  /** 不感兴趣：移出首页和默认列表，且不再推荐 */
  notInterested: integer("not_interested", { mode: "boolean" }).notNull().default(false),
  readState: text("read_state", { enum: ["unread", "reading", "read"] }).notNull().default("unread"),
  /** 阅读进度 0–1 */
  progress: real("progress").notNull().default(0),
  updatedAt: createdAt("updated_at"),
});

/** 笔记：section 为空串表示整篇笔记，否则是挂在该段标题下的段落批注 */
export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paperId: text("paper_id").notNull(),
    section: text("section").notNull().default(""),
    content: text("content").notNull(),
    createdAt: createdAt(),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [uniqueIndex("notes_paper_section").on(t.paperId, t.section)],
);

/** Highlights are independent from the whole-document notebook. Offsets refer to rendered text. */
export const readingHighlights = sqliteTable("reading_highlights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: text("subject_id").notNull(),
  quote: text("quote").notNull(),
  prefix: text("prefix").notNull().default(""),
  suffix: text("suffix").notNull().default(""),
  start: integer("start").notNull(),
  comment: text("comment").notNull().default(""),
  color: text("color").notNull().default("#ffe066"),
  createdAt: createdAt(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const digestTags = sqliteTable(
  "digest_tags",
  {
    digestId: integer("digest_id").notNull(),
    tagId: integer("tag_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.digestId, t.tagId] })],
);

export const storyboards = sqliteTable("storyboards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  digestId: integer("digest_id").notNull().unique(),
  scenes: text("scenes", { mode: "json" }).notNull(),
  requirementsVersionId: integer("requirements_version_id"),
  createdAt: createdAt(),
});

export const videos = sqliteTable("videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  digestId: integer("digest_id").notNull().unique(),
  path: text("path").notNull(),
  durationSec: real("duration_sec").notNull(),
  styleId: integer("style_id"),
  createdAt: createdAt(),
});

export const musicTracks = sqliteTable("music_tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  createdAt: createdAt(),
});

export const trendReports = sqliteTable("trend_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull().unique(), // YYYY-MM
  title: text("title").notNull(),
  contentMd: text("content_md").notNull(),
  requirementsVersionId: integer("requirements_version_id"),
  createdAt: createdAt(),
});

/** 通知事件：新解读、新月报、运行失败 */
export const NOTIFY_EVENTS = ["digest", "report", "failure"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const notifyChannels = sqliteTable("notify_channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["email", "feishu", "wecom", "dingtalk"] }).notNull(),
  /** email: {to, host?, port?, user?, pass?, from?}（未填 host 时用 SMTP_* 环境变量）；webhook: {url, secret?} */
  config: text("config", { mode: "json" }).$type<Record<string, string>>().notNull(),
  /** 订阅的通知事件 */
  events: text("events", { mode: "json" }).$type<NotifyEvent[]>().notNull().default(["digest", "report", "failure"]),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

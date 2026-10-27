import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
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
  kind: text("kind", { enum: ["digest", "trend_report"] }).notNull(),
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

export type RunParams = { picks?: number; paperIds?: string[]; month?: string; videoDigestId?: number; modelSnapshot?: import("../model-policy").RunModelSnapshot };

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
  status: text("status", { enum: ["published", "hidden"] }).notNull().default("published"),
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
  createdAt: createdAt(),
});

export const videos = sqliteTable("videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  digestId: integer("digest_id").notNull().unique(),
  path: text("path").notNull(),
  durationSec: real("duration_sec").notNull(),
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

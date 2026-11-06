import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db, schema } from "../db";
import type { Stage } from "../settings";
import { modelsUrlCandidates } from "./endpoints";
import { oauthToken } from "./oauth";
import { explainNetworkError } from "../http";
import { isOfficialAnthropic } from "./compat";
import { createModelSnapshot, findModelTarget, targetIssue, type RunModelSnapshot, type FrozenTarget } from "../model-policy";
import { providerHeaders, nonNullHeaders, supportsEffort, redactProviderError } from "./connection";
import { sseData } from "./sse";

export type Provider = typeof schema.llmProviders.$inferSelect;
export type Model = typeof schema.llmModels.$inferSelect;
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type { Stage };

export interface GenerateInput {
  system: string;
  prompt: string;
  /** Public answer deltas only; reset clears a failed primary before an explicit fallback. */
  onText?: (delta: string, reset?: boolean) => void;
  /** 随提示一起发送的图片（需要模型支持看图），如参考视频的关键帧 */
  images?: { mediaType: "image/jpeg" | "image/png"; data: string }[];
}

const dataUrl = (i: NonNullable<GenerateInput["images"]>[number]) => `data:${i.mediaType};base64,${i.data}`;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CallOptions {
  maxTokens: number;
  effort: Effort | null;
}

export interface Llm {
  /** 「服务商 / 模型」，用于日志 */
  label: string;
  generate(input: GenerateInput): Promise<string>;
}

interface RawResult {
  text: string;
  usage: Usage;
}

type RawCall = (input: GenerateInput) => Promise<RawResult>;

/** 这些模型支持服务端拒答回退（server-side fallback） */
const SERVER_FALLBACK_MODELS = /^claude-(fable-5|opus-5|sonnet-5-5)/;
/** 不支持 effort 的旧 Claude 模型 */
const NO_EFFORT_MODELS = /^claude-(3|haiku-4|sonnet-4-5|opus-4-1|opus-4-0|sonnet-4-0)/;

const isOfficial = (p: Provider) => isOfficialAnthropic(p.baseUrl);

function anthropicClient(p: Provider) {
  return new Anthropic({ apiKey: p.apiKey || "no-key", baseURL: p.options?.fullUrl ? new URL(p.baseUrl!).origin : p.baseUrl || undefined, defaultHeaders: providerHeaders(p), fetch: connectionFetch(p), timeout: p.options?.timeoutMs ?? 30 * 60_000 });
}

function connectionFetch(p: Provider): typeof fetch {
  return (input, init) => fetch(p.options?.fullUrl ? p.baseUrl! : input, { ...init, redirect: "error" });
}

function openaiClient(p: Provider) {
  // 本地服务（如 Ollama）可以不填 Key
  return new OpenAI({ apiKey: p.apiKey || "no-key", baseURL: p.options?.fullUrl ? new URL(p.baseUrl!).origin : p.baseUrl || undefined, defaultHeaders: providerHeaders(p), fetch: connectionFetch(p), timeout: p.options?.timeoutMs ?? 30 * 60_000 });
}

function anthropicCall(p: Provider, m: Model, opts: CallOptions): RawCall {
  const client = anthropicClient(p);
  const id = m.upstreamModelId || m.modelId;
  const effort = opts.effort && supportsEffort(p, m) && !NO_EFFORT_MODELS.test(id) ? opts.effort : null;
  const serverFallback = isOfficial(p) && SERVER_FALLBACK_MODELS.test(id);
  return async ({ system, prompt, images, onText }) => {
    const content = images?.length
      ? [...images.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } })), { type: "text" as const, text: prompt }]
      : prompt;
    const params = {
      model: id,
      max_tokens: opts.maxTokens,
      system,
      messages: [{ role: "user" as const, content }],
      ...(effort ? { output_config: { effort } } : {}),
    };
    const message = await client.beta.messages
      .stream(
        (serverFallback
          ? { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
          : params) as Anthropic.Beta.MessageCreateParamsStreaming,
      )
      .on("text", delta => onText?.(delta))
      .finalMessage();
    if (message.stop_reason === "refusal") throw new Error(`模型拒绝了请求 (${id})`);
    if (message.stop_reason === "max_tokens") throw new Error(`输出被截断，请调大最大输出 (${id})`);
    const u = message.usage;
    return {
      text: message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join(""),
      usage: {
        inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens,
      },
    };
  };
}

function openaiCall(p: Provider, m: Model, opts: CallOptions): RawCall {
  const client = openaiClient(p);
  return async ({ system, prompt, images, onText }) => {
    const user: OpenAI.ChatCompletionUserMessageParam["content"] = images?.length
      ? [{ type: "text", text: prompt }, ...images.map((i) => ({ type: "image_url" as const, image_url: { url: dataUrl(i) } }))]
      : prompt;
    const stream = await client.chat.completions.create({
      model: m.upstreamModelId || m.modelId,
      [p.options?.maxTokensField ?? "max_tokens"]: opts.maxTokens,
      ...(opts.effort && supportsEffort(p,m) ? { reasoning_effort: opts.effort as OpenAI.ReasoningEffort } : {}),
      ...(p.options?.reasoning === "thinking" ? { thinking: { type: "enabled" } } : {}),
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    let text = "";
    let finish: string | null = null;
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      text += delta;
      if (delta) onText?.(delta);
      finish = chunk.choices[0]?.finish_reason ?? finish;
      if (chunk.usage) {
        usage.inputTokens = chunk.usage.prompt_tokens;
        usage.outputTokens = chunk.usage.completion_tokens;
      }
    }
    if (finish === "length") throw new Error(`输出被截断，请调大最大输出 (${m.modelId})`);
    if (onText && finish !== "stop") throw new Error("模型输出未完成，请重试");
    return { text, usage };
  };
}

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

const DEFAULT_HOST = { anthropic: "api.anthropic.com", openai: "api.openai.com", responses: "api.openai.com", gemini: "generativelanguage.googleapis.com", codex: "chatgpt.com" } as const;
const hostOf = (p: Provider) => (p.baseUrl ? new URL(p.baseUrl).host : DEFAULT_HOST[p.protocol]);

/** Codex 请求头：订阅令牌 + ChatGPT 账号 id */
async function codexHeaders(p: Provider) {
  const t = await oauthToken(p);
  return {
    authorization: `Bearer ${t.access}`,
    "chatgpt-account-id": t.accountId,
    originator: "paper_web",
    "OpenAI-Beta": "responses=experimental",
  };
}

/** Responses API；ChatGPT 订阅使用独立 OAuth，且不设置输出上限。 */
function responsesCall(p: Provider, m: Model, opts: CallOptions): RawCall {
  const id = m.upstreamModelId || m.modelId;
  const effort = opts.effort;
  const api = p.protocol === "codex" ? "Codex" : "Responses";
  return async ({ system, prompt, images, onText }) => {
    const { authorization, ...headers } = p.protocol === "codex" ? await codexHeaders(p) : { authorization: "", ...nonNullHeaders(providerHeaders(p)) };
    const client = p.protocol !== "codex" ? openaiClient(p) : new OpenAI({
      apiKey: authorization.slice("Bearer ".length),
      baseURL: p.baseUrl || CODEX_BASE_URL,
      defaultHeaders: headers,
      timeout: p.options?.timeoutMs ?? 30 * 60_000,
      fetch: connectionFetch(p),
    });
    const stream = await client.responses.create({
      model: id,
      instructions: system,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...(images ?? []).map((i) => ({ type: "input_image" as const, image_url: dataUrl(i), detail: "auto" as const }))] }],
      store: false,
      stream: true,
      ...(p.protocol !== "codex" ? { max_output_tokens: opts.maxTokens } : {}),
      ...(effort && supportsEffort(p,m) ? { reasoning: { effort: effort as OpenAI.Reasoning["effort"] } } : {}),
    });
    let text = "";
    let final = null as OpenAI.Responses.Response | null;
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") { text += ev.delta; onText?.(ev.delta); }
      else if (ev.type === "response.completed" || ev.type === "response.incomplete") final = ev.response;
      else if (ev.type === "response.failed") throw new Error(`${api} 请求失败 (${id})：${ev.response.error?.message ?? "未知错误"}`);
      else if (ev.type === "error") throw new Error(`${api} 请求失败 (${id})：${ev.message}`);
    }
    if (final?.status === "incomplete") {
      const reason = final.incomplete_details?.reason;
      throw new Error(reason === "max_output_tokens" ? `输出被截断 (${id})` : `${api} 输出不完整 (${id})：${reason ?? "未知原因"}`);
    }
    const u = final?.usage;
    if (onText && final?.status !== "completed") throw new Error(`${api} 连接中断，回答未完成`);
    return { text, usage: { inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0 } };
  };
}

function rawCall(p: Provider, m: Model, opts: CallOptions): RawCall {
  if (p.protocol === "codex" || p.protocol === "responses") return responsesCall(p, m, opts);
  if (p.protocol === "gemini") return geminiCall(p, m, opts);
  return p.protocol === "anthropic" ? anthropicCall(p, m, opts) : openaiCall(p, m, opts);
}

function geminiCall(p: Provider, m: Model, opts: CallOptions): RawCall {
  return async ({ system, prompt, images, onText }) => {
    const base = (p.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const root = /\/v1(?:beta)?$/.test(base) ? base : `${base}/v1beta`;
    const model = (m.upstreamModelId || m.modelId).replace(/^models\//, "");
    const url = p.options?.fullUrl ? p.baseUrl!.trim() : `${root}/models/${encodeURIComponent(model)}:${onText ? "streamGenerateContent?alt=sse" : "generateContent"}`;
    const response = await fetch(url, { method: "POST", redirect: "error", headers: { ...nonNullHeaders(providerHeaders(p)), "content-type": "application/json" }, signal: AbortSignal.timeout(p.options?.timeoutMs ?? 1800000), body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }, ...(images ?? []).map((i) => ({ inlineData: { mimeType: i.mediaType, data: i.data } }))] }], generationConfig: { maxOutputTokens: opts.maxTokens },
    }) });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0,1000)}`);
    if (onText && response.headers.get("content-type")?.includes("text/event-stream")) {
      if (!response.body) throw new Error("Gemini 未返回数据流");
      let text = "", finish: string | undefined;
      let usage: Usage = { inputTokens: 0, outputTokens: 0 };
      for await (const data of sseData(response.body)) {
        const chunk = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }; error?: { message?: string }; promptFeedback?: { blockReason?: string } };
        if (chunk.error || chunk.promptFeedback?.blockReason) throw new Error(chunk.error?.message || `Gemini 拒绝请求：${chunk.promptFeedback?.blockReason}`);
        const candidate = chunk.candidates?.[0];
        const delta = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
        if (delta) { text += delta; onText(delta); }
        finish = candidate?.finishReason ?? finish;
        if (chunk.usageMetadata) usage = { inputTokens: chunk.usageMetadata.promptTokenCount ?? 0, outputTokens: (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0) };
      }
      if (finish !== "STOP") throw new Error(`Gemini 输出未完成：${finish ?? "连接中断"}`);
      return { text, usage };
    }
    const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }; promptFeedback?: { blockReason?: string }; error?: { message?: string } };
    if (body.error || body.promptFeedback?.blockReason) throw new Error(body.error?.message || `Gemini 拒绝请求：${body.promptFeedback?.blockReason}`);
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") throw new Error(`输出被截断，请调大最大输出 (${model})`);
    if (!candidate || (candidate.finishReason && candidate.finishReason !== "STOP")) throw new Error(`Gemini 输出未完成：${candidate?.finishReason ?? "无候选内容"}`);
    const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
    if (text) onText?.(text);
    return { text, usage: { inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0) } };
  };
}

function estimateCost(m: Pick<Model, "priceInput" | "priceOutput">, u: Usage): number | null {
  if (m.priceInput == null && m.priceOutput == null) return null;
  return (u.inputTokens * (m.priceInput ?? 0) + u.outputTokens * (m.priceOutput ?? 0)) / 1e6;
}

// ---------- 运行上下文：把调用记录关联到当前 run ----------

type RunRequirements = Partial<Record<Stage, number>>;
const runContext = new AsyncLocalStorage<{ runId: number; snapshot?: RunModelSnapshot; requirements?: RunRequirements }>();

export function withRunContext<T>(runId: number, fn: () => Promise<T>, snapshot?: RunModelSnapshot, requirements?: RunRequirements): Promise<T> {
  return runContext.run({ runId, snapshot, requirements }, fn);
}

/** 当前运行锁定的写作要求版本（不在运行中时为空） */
export function runRequirements(): RunRequirements | undefined {
  return runContext.getStore()?.requirements;
}

interface Target {
  provider: Provider;
  model: Model;
}

/** 调用一次并写入 llm_calls；参数默认取模型上的设置 */
async function loggedCall(stage: string, t: Target, input: GenerateInput, isFallback: boolean, override?: Partial<CallOptions>) {
  const opts: CallOptions = { maxTokens: t.model.maxOutputTokens, effort: t.model.effort, ...override };
  const started = Date.now();
  const base = {
    runId: runContext.getStore()?.runId ?? null,
    stage,
    modelRefId: t.model.id,
    providerName: t.provider.name,
    modelId: t.model.modelId,
    isFallback,
  };
  try {
    const r = await rawCall(t.provider, t.model, opts)(input);
    db.insert(schema.llmCalls)
      .values({
        ...base,
        ...r.usage,
        costUsd: estimateCost(t.model, r.usage),
        latencyMs: Date.now() - started,
        status: "ok",
      })
      .run();
    return r;
  } catch (raw) {
    const net = explainNetworkError(raw, hostOf(t.provider));
    const e = new Error(redactProviderError(net ?? (raw instanceof Error ? raw.message : String(raw)), t.provider));
    db.insert(schema.llmCalls)
      .values({ ...base, latencyMs: Date.now() - started, status: "error", error: String(e).slice(0, 2000) })
      .run();
    throw e;
  }
}

// ---------- 模型解析 ----------

function thawTarget(target: FrozenTarget): Target {
  const credentials = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, target.provider.id)).get();
  if (!credentials) throw new Error(`服务商 ${target.provider.name} 已不存在`);
  return { model: target.model, provider: { ...target.provider, options: { ...target.provider.options, headers: credentials.options?.headers }, apiKey: credentials.apiKey, oauth: credentials.oauth } };
}

/** 只使用本次运行固定的模型；不寻找隐式替代。凭据在请求时取最新值。 */
export function llmForStage(stage: Stage, options?: Partial<CallOptions>): Llm {
  const snapshot = runContext.getStore()?.snapshot ?? createModelSnapshot([stage]);
  const cfg = snapshot.stages[stage];
  if (!cfg) throw new Error(`本次运行没有固定「${stage}」模型配置`);
  return {
    label: `${cfg.primary.provider.name} / ${cfg.primary.model.modelId}`,
    async generate(input) {
      try { return (await loggedCall(stage, thawTarget(cfg.primary), input, false, options)).text; }
      catch (e) {
        if (!cfg.fallback) throw e;
        input.onText?.("", true);
        console.warn(`[llm] 主模型失败，尝试明确指定的备用模型 ${cfg.fallback.model.modelId}`);
        return (await loggedCall(stage, thawTarget(cfg.fallback), input, true, options)).text;
      }
    },
  };
}

// ---------- 后台：拉取模型列表与测试 ----------

/** A reader's explicit model choice applies to this request; pipeline policy stays unchanged. */
export function llmForReadingModel(id: number, options?: Partial<CallOptions>): Llm {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("请选择有效的模型");
  const issue = targetIssue(id);
  if (issue) throw new Error(`所选模型不可用：${issue}`);
  const target = findModelTarget(id)!;
  return { label: `${target.provider.name} / ${target.model.modelId}`, async generate(input) {
    return (await loggedCall("chat", target, input, false, options)).text;
  } };
}

export interface RemoteModel {
  modelId: string;
  displayName?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
}

/** 从服务商拉取可用模型，依次尝试候选地址；同时兼容 data[].id 与 models[].slug 两种返回格式 */
export async function listRemoteModels(p: Provider, presetUrl?: string): Promise<RemoteModel[]> {
  const headers = p.protocol === "codex" ? await codexHeaders(p) : nonNullHeaders(providerHeaders(p));
  const errors: string[] = [];
  for (const firstUrl of modelsUrlCandidates(p, presetUrl)) {
    try {
      const output = new Map<string,RemoteModel>();
      let url: string | null = firstUrl;
      for (let page = 0; url && page < 10; page++) {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(Math.min(p.options?.timeoutMs ?? 15000, 60000)), redirect: "error" });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0,200)}`);
        const body = await res.json() as { data?: unknown[]; models?: unknown[]; nextPageToken?: string };
        const list = body.data ?? body.models;
        if (!Array.isArray(list)) throw new Error("模型列表格式不正确");
        for (const raw of list) {
          if (!raw || typeof raw !== "object") continue;
          const m = raw as Record<string,unknown>;
          const modelId = String(m.id ?? m.slug ?? m.name ?? "").replace(p.protocol === "gemini" ? /^models\// : /$^/, "");
          if (!modelId) continue;
          output.set(modelId, { modelId, displayName: typeof (m.display_name ?? m.displayName) === "string" ? String(m.display_name ?? m.displayName) : undefined, maxOutputTokens: typeof (m.max_tokens ?? m.outputTokenLimit) === "number" ? Number(m.max_tokens ?? m.outputTokenLimit) : undefined, contextWindow: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : undefined });
        }
        if (p.protocol === "gemini" && body.nextPageToken) { const next = new URL(firstUrl); next.searchParams.set("pageToken",body.nextPageToken); url = next.toString(); } else url = null;
      }
      if (output.size) return [...output.values()].sort((a,b) => a.modelId.localeCompare(b.modelId));
      throw new Error("列表为空");
    } catch (e) { errors.push(redactProviderError(`${firstUrl} → ${explainNetworkError(e,new URL(firstUrl).host) ?? String(e)}`,p)); }
  }
  throw new Error(errors.join("；"));
}

export interface TestResult {
  text: string;
  usage: Usage;
  latencyMs: number;
}

/** 用一次真实对话测试模型是否可用（记入用量，环节为 test） */
export async function testModel(modelRefId: number): Promise<TestResult> {
  const t = db
    .select({ provider: schema.llmProviders, model: schema.llmModels })
    .from(schema.llmModels)
    .innerJoin(schema.llmProviders, eq(schema.llmModels.providerId, schema.llmProviders.id))
    .where(eq(schema.llmModels.id, modelRefId))
    .get();
  if (!t) throw new Error("模型不存在");
  const started = Date.now();
  const r = await loggedCall(
    "test",
    t,
    { system: "你是一个连通性测试助手。", prompt: "请只回复：连接成功" },
    false,
    { maxTokens: Math.min(4000, t.model.maxOutputTokens), effort: supportsEffort(t.provider,t.model) ? t.model.effort ?? "low" : null },
  );
  return { ...r, latencyMs: Date.now() - started };
}

/** 从模型输出中取出 JSON（容忍 ```json 代码块与前后说明文字） */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("模型输出中没有 JSON");
  return JSON.parse(body.slice(start, end + 1));
}

/** 生成 JSON 并用 zod 校验，失败时把错误反馈给模型重试 */
export async function generateJson<T extends z.ZodType>(
  llm: Llm,
  input: GenerateInput,
  schema: T,
  retries = 2,
): Promise<z.infer<T>> {
  let prompt = input.prompt;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const text = await llm.generate({ system: input.system, prompt, images: input.images });
    try {
      return schema.parse(extractJson(text));
    } catch (e) {
      lastErr = e;
      prompt = `${input.prompt}\n\n你上一次的输出无法通过校验：${String(e).slice(0, 1500)}\n请严格只输出符合要求的 JSON。`;
    }
  }
  throw lastErr;
}

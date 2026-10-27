import { z } from "zod";

export const PROTOCOLS = ["anthropic", "openai", "responses", "gemini", "codex"] as const;
export type Protocol = typeof PROTOCOLS[number];
export const httpUrl = z.string().trim().max(2048).refine(value => {
  if (!value) return true;
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}, "请填写不含用户名和密码的完整 HTTP 地址");
export const requestHeadersSchema = z.record(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), z.string().max(8192).refine(v => !/[\r\n]/.test(v), "请求头不能包含换行")).superRefine((headers, ctx) => {
  const names = Object.keys(headers).map(k => k.toLowerCase());
  if (names.length > 30 || new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: "请求头最多 30 项，名称不能重复" });
  if (names.some(k => ["host", "content-length", "connection", "transfer-encoding"].includes(k))) ctx.addIssue({ code: "custom", message: "不能覆盖 Host、连接或传输长度请求头" });
});
export const providerOptionsSchema = z.object({
  modelsUrl: httpUrl.optional(),
  fullUrl: z.boolean().optional(),
  authMode: z.enum(["auto", "bearer", "x-api-key", "x-goog-api-key", "none"]).optional(),
  headers: requestHeadersSchema.optional(),
  timeoutMs: z.number().int().min(1000).max(1800000).optional(),
  maxTokensField: z.enum(["max_tokens", "max_completion_tokens"]).optional(),
  reasoning: z.enum(["auto", "off", "effort", "thinking"]).optional(),
});
export type ProviderOptions = z.infer<typeof providerOptionsSchema>;

export function supportsEffort(p: { protocol: string; options?: ProviderOptions | null }, m: { modelId: string; upstreamModelId?: string | null }) {
  if (p.protocol === "gemini" || p.options?.reasoning === "off" || p.options?.reasoning === "thinking") return false;
  const model = m.upstreamModelId || m.modelId;
  return p.options?.reasoning === "effort" || p.protocol === "codex" || (["openai", "responses"].includes(p.protocol) && /^(?:gpt-[56](?:[.\-]|$)|o[1-9](?:[\-]|$))/.test(model)) || (p.protocol === "anthropic" && model.startsWith("claude-"));
}

/** All custom header values are treated as credentials, even when their names look harmless. */
export function providerSecrets(p: { apiKey: string; options?: ProviderOptions | null; oauth?: { access?: string; refresh?: string } | null }) {
  return [p.apiKey, p.oauth?.access, p.oauth?.refresh, ...Object.values(p.options?.headers ?? {})].filter((s): s is string => !!s);
}
export function redactProviderError(message: string, p: Parameters<typeof providerSecrets>[0]) {
  for (const secret of providerSecrets(p).sort((a,b) => b.length - a.length)) message = message.split(secret).join("***");
  return message;
}
export function providerHeaders(p: { protocol: Protocol; apiKey: string; options?: ProviderOptions | null }): Record<string, string | null> {
  const headers: Record<string, string | null> = { authorization: null, "x-api-key": null, "x-goog-api-key": null };
  const mode = p.options?.authMode ?? "auto";
  const selected = mode === "auto" ? p.protocol === "anthropic" ? "x-api-key" : p.protocol === "gemini" ? "x-goog-api-key" : "bearer" : mode;
  if (p.apiKey) {
    if (selected === "bearer") headers.authorization = `Bearer ${p.apiKey}`;
    else if (selected !== "none") headers[selected] = p.apiKey;
  }
  for (const [name,value] of Object.entries(p.options?.headers ?? {})) headers[name.toLowerCase()] = value;
  if (p.protocol === "anthropic") headers["anthropic-version"] ??= "2023-06-01";
  return headers;
}
export function nonNullHeaders(headers: Record<string, string | null>) { return Object.fromEntries(Object.entries(headers).filter((entry): entry is [string,string] => entry[1] != null)); }

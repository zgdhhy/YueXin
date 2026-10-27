const DEFAULT_BASE = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  codex: "https://chatgpt.com/backend-api/codex",
  responses: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};
/** Codex 模型列表按客户端版本过滤，填一个较新的版本号 */
const CODEX_CLIENT_VERSION = "0.200.0";
/** Anthropic 兼容端点常见的路径后缀，去掉后在根地址上再试 */
const COMPAT_SUFFIX = /\/(api\/anthropic|apps\/anthropic|anthropic|claude|claudecode|coding|compatible-mode\/v\d+)$/;

/** 模型列表地址候选：预设指定的地址 → {base}/v1/models 或 {base}/models → 去掉兼容后缀的根地址 */
export function modelsUrlCandidates(p: { protocol: keyof typeof DEFAULT_BASE; baseUrl: string | null; options?: import("./connection").ProviderOptions | null }, presetUrl?: string): string[] {
  if (p.options?.modelsUrl) return [p.options.modelsUrl];
  const urls: string[] = presetUrl ? [presetUrl] : [];
  if (p.protocol === "gemini") {
    const base = (p.baseUrl || DEFAULT_BASE.gemini).replace(/\/+$/, "");
    return [...new Set([...urls, /\/v1(?:beta)?$/.test(base) ? `${base}/models` : `${new URL(base).origin}/v1beta/models`])];
  }
  if (p.protocol === "codex") {
    urls.push(`${(p.baseUrl || DEFAULT_BASE.codex).replace(/\/+$/, "")}/models?client_version=${CODEX_CLIENT_VERSION}`);
    return [...new Set(urls)];
  }
  const add = (base: string) => {
    if (/\/v\d+$/.test(base)) urls.push(`${base}/models`);
    else urls.push(`${base}/v1/models`, `${base}/models`);
  };
  const base = (p.baseUrl || DEFAULT_BASE[p.protocol]).replace(/\/+$/, "");
  if (p.options?.fullUrl) { add(new URL(base).origin); return [...new Set(urls)]; }
  add(base);
  const root = base.replace(COMPAT_SUFFIX, "");
  if (root !== base) add(root);
  return [...new Set(urls)];
}

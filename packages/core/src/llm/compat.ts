/**
 * Endpoint-family handling adapted from CC Switch v4.0.18 (MIT).
 * Upstream: src-tauri/src/proxy/providers/codex.rs, endpoint / wire-api detection.
 * We use explicit protocol selection; no desktop proxy or CLI config is imported.
 * See docs/third-party/cc-switch.md and CC-Switch-LICENSE.txt.
 */
export function normalizeProviderBaseUrl(value: string, protocol: import("./connection").Protocol, fullUrl = false) {
  if (fullUrl) return value.trim();
  const base = value.trim().replace(/\/+$/, "");
  if (protocol === "gemini") return base;
  if (protocol === "openai") return base.replace(/\/chat\/completions$/, "");
  if (protocol === "anthropic") return base.replace(/\/(?:v1\/)?messages$/, "");
  return base.replace(/\/responses(?:\/compact)?$/, "");
}
export function isOfficialAnthropic(baseUrl: string | null) {
  if (!baseUrl) return true;
  try { return new URL(baseUrl).hostname === "api.anthropic.com"; } catch { return false; }
}

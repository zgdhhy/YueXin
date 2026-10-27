// Regenerate reviewed provider metadata from an already downloaded upstream checkout.
// Usage: node scripts/sync-cc-switch-presets.mjs data/upstream-cc-switch-20261026
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const root = process.argv[2];
if (!root) throw new Error("Pass the path to the reviewed CC Switch checkout");
const revision = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
function load(name, key) {
  const source = fs.readFileSync(path.join(root, "src/config", name), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => { throw new Error(`Unexpected executable dependency: ${id}`); } }, { timeout: 1000 });
  return exports[key];
}
const families = load("presetFamilies.ts", "PRESET_FAMILIES");
const iconSource=fs.existsSync("packages/core/src/llm/icon-assets.ts")?fs.readFileSync("packages/core/src/llm/icon-assets.ts","utf8"):"";
const icons = new Set([...fs.readFileSync("packages/core/src/llm/icons.ts", "utf8").matchAll(/\["([\w-]+)",/g)].map(m => m[1]).concat([...iconSource.matchAll(/^  "([\w-]+)": \{/gm)].map(m=>m[1])));
const slug = s => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");
const cleanUrl = value => { if (!value) return undefined; try { const u = new URL(value); for (const k of [...u.searchParams.keys()]) if (/^(aff|ref|referral|track|utm)/i.test(k)) u.searchParams.delete(k); return u.toString().replace(/\/$/, ""); } catch { return undefined; } };
const formats = { anthropic: "anthropic", openai_chat: "openai", openai_responses: "responses", gemini_native: "gemini" };
const presets = new Map();
const skipped = [];
for (const [file, key, app] of [["claudeProviderPresets.ts", "providerPresets", "claude"], ["codexProviderPresets.ts", "codexProviderPresets", "codex"], ["geminiProviderPresets.ts", "geminiProviderPresets", "gemini"]]) {
  for (const p of load(file, key)) {
    const env = p.settingsConfig?.env ?? {};
    const unsupported = p.hidden || p.requiresOAuth || env.CLAUDE_CODE_USE_BEDROCK || env.CLAUDE_CODE_USE_VERTEX || p.isCustomTemplate;
    const base = app === "codex" ? p.config?.match(/^base_url\s*=\s*("[^\n]*")/m)?.[1] : env.ANTHROPIC_BASE_URL || p.baseURL || env.GOOGLE_GEMINI_BASE_URL;
    const baseUrl = cleanUrl(app === "codex" && base ? JSON.parse(base) : base);
    if (unsupported || !baseUrl || /\{|\}|<|>/.test(baseUrl)) { skipped.push({ name: p.name, app, reason: unsupported ? "desktop authentication, hidden or template variables" : "no directly usable API endpoint" }); continue; }
    const protocol = app === "gemini" ? "gemini" : formats[p.apiFormat ?? (app === "codex" ? "openai_responses" : "anthropic")];
    const modelIds = [...new Set([env.ANTHROPIC_MODEL, env.ANTHROPIC_DEFAULT_HAIKU_MODEL, env.ANTHROPIC_DEFAULT_SONNET_MODEL, env.ANTHROPIC_DEFAULT_OPUS_MODEL, p.model, env.GEMINI_MODEL, ...(p.modelCatalog ?? []).map(m => m.model)].filter(m => typeof m === "string" && m && !/[{}]/.test(m)))];
    const family = p.family ?? slug(p.name);
    const signature = `${p.name}|${protocol}|${baseUrl}`;
    const item = {
      id: `cc-${slug(p.name)}-${protocol}-${crypto.createHash("sha256").update(baseUrl).digest("hex").slice(0,8)}`,
      name: p.name, protocol, kind: p.planKey && !["payg", "apiKey", "aksk"].includes(p.planKey) || /coding|token plan|agent plan|step plan/i.test(p.name) ? "plan" : "api",
      group: p.category === "cloud_provider" ? "cloud" : p.category === "cn_official" ? "vendor" : p.category === "local" ? "local" : "thirdparty",
      family, familyName: families[family]?.name ?? p.name, ...(p.planKey ? { plan: p.planKey } : {}), ...(p.regionKey ? { region: p.regionKey } : {}),
      baseUrl, icon: icons.has(p.icon) ? p.icon : null, keyUrl: cleanUrl(p.apiKeyUrl || p.websiteUrl),
      models: modelIds, ...(p.modelsUrl ? { modelsUrl: p.modelsUrl } : {}),
      options: { authMode: protocol === "anthropic" ? p.apiKeyField === "ANTHROPIC_API_KEY" || Object.hasOwn(env,"ANTHROPIC_API_KEY") ? "x-api-key" : "bearer" : protocol === "gemini" ? "x-goog-api-key" : "bearer", ...(p.codexChatReasoning?.supported === false ? { reasoning: "off" } : {}) },
      modelDefaults: Object.fromEntries((p.modelCatalog ?? []).map(m => [m.model, { ...(m.displayName ? {displayName:m.displayName} : {}), ...(m.contextWindow ? {contextWindow:m.contextWindow} : {}), ...(m.maxOutputTokens ? {maxOutputTokens:m.maxOutputTokens} : {}) }])),
      source: `cc-switch ${revision.slice(0,7)} / ${app}`,
    };
    if (presets.has(signature)) presets.get(signature).models = [...new Set([...presets.get(signature).models,...modelIds])];
    else presets.set(signature, item);
  }
}
const rows = [...presets.values()];
rows.push({ id: "gemini-native", name: "Google Gemini API（原生）", family: "google", familyName: "Google Gemini", protocol: "gemini", kind: "api", baseUrl: "https://generativelanguage.googleapis.com/v1beta", keyUrl: "https://aistudio.google.com/apikey", icon: "gemini", models: [], source: `cc-switch ${revision.slice(0,7)} / Gemini native adapter` });
fs.writeFileSync("packages/core/src/llm/cc-switch-presets.ts", `/** Provider metadata adapted from CC Switch (MIT), copyright (c) 2025 Jason Young.\n * Pinned source: https://github.com/farion1231/cc-switch/tree/${revision}\n * Generated by scripts/sync-cc-switch-presets.mjs. No credentials or affiliate promotion imported.\n */\nimport type { Preset } from "./presets";\nexport const CC_SWITCH_PRESETS: Preset[] = ${JSON.stringify(rows,null,2)};\n`);
fs.writeFileSync("data/cc-switch-port-report.json", JSON.stringify({revision,templates:rows.length,skipped},null,2));
console.log(`Imported ${rows.length} API templates; ${skipped.length} desktop-only/hidden entries excluded. Revision ${revision}`);

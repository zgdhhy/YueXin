import type { LlmIcon } from "./icons";
import { CC_SWITCH_PRESETS } from "./cc-switch-presets";
import type { Protocol, ProviderOptions } from "./connection";

/** 服务商预设：添加时选模板即可，只需填 Key（订阅类登录即可） */
export interface Preset {
  id: string;
  name: string;
  protocol: Protocol;
  family?: string;
  group?: "login" | "vendor" | "thirdparty" | "cloud" | "local";
  familyName?: string;
  plan?: string;
  region?: string;
  source?: string;
  options?: ProviderOptions;
  modelDefaults?: Record<string, { contextWindow?: number; maxOutputTokens?: number; displayName?: string }>;
  /** api：按量计费的 API；plan：订阅套餐（Coding Plan 或 OAuth 登录） */
  kind: "api" | "plan";
  /** oauth：在后台登录账号，不填 Key */
  authType?: "api_key" | "oauth";
  /** 可以不填 Key（本地服务） */
  keyOptional?: boolean;
  /** 添加时显示的说明 */
  note?: string;
  baseUrl: string | null;
  icon: LlmIcon | null;
  /** 获取 Key 的地址 */
  keyUrl?: string;
  /** 模型列表地址，默认按 baseUrl 推断 */
  modelsUrl?: string;
  /** 推荐模型 id；拉取列表失败时也可直接添加，参数见 catalog.ts */
  models: string[];
}

const LEGACY_PRESETS: Preset[] = [
  {
    id: "anthropic",
    icon: "anthropic",
    name: "Anthropic",
    protocol: "anthropic",
    kind: "api",
    baseUrl: null,
    keyUrl: "https://platform.claude.com/settings/keys",
    models: ["claude-opus-5-5", "claude-fable-5-1", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  {
    id: "openai",
    icon: "openai",
    name: "OpenAI",
    protocol: "openai",
    kind: "api",
    baseUrl: null,
    keyUrl: "https://platform.openai.com/api-keys",
    models: [],
  },
  {
    id: "deepseek",
    icon: "deepseek",
    name: "DeepSeek",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [],
  },
  {
    id: "qwen",
    icon: "bailian",
    name: "通义千问（百炼）",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyUrl: "https://bailian.console.aliyun.com/",
    models: [],
  },
  {
    id: "moonshot",
    icon: "kimi",
    name: "Moonshot（Kimi）",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://api.moonshot.cn/v1",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    models: [],
  },
  {
    id: "zhipu",
    icon: "zhipu",
    name: "智谱 GLM",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    models: [],
  },
  {
    id: "minimax",
    icon: "minimax",
    name: "MiniMax",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://api.minimaxi.com/v1",
    keyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    models: [],
  },
  {
    id: "volcengine",
    icon: "volcengine",
    name: "火山方舟（豆包）",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    keyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    models: [],
  },
  {
    id: "gemini",
    icon: "gemini",
    name: "Google Gemini",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [],
  },
  {
    id: "openrouter",
    icon: "openrouter",
    name: "OpenRouter",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    models: [],
  },
  {
    id: "siliconflow",
    icon: "siliconcloud",
    name: "硅基流动",
    protocol: "openai",
    kind: "api",
    baseUrl: "https://api.siliconflow.cn/v1",
    keyUrl: "https://cloud.siliconflow.cn/account/ak",
    models: [],
  },
  {
    id: "ollama",
    icon: "ollama",
    name: "Ollama（本地）",
    protocol: "openai",
    kind: "api",
    keyOptional: true,
    baseUrl: "http://localhost:11434/v1",
    models: [],
  },
  // ---------- 订阅套餐 ----------
  {
    id: "codex",
    icon: "codex",
    name: "ChatGPT 订阅（Codex）",
    protocol: "codex",
    kind: "plan",
    authType: "oauth",
    baseUrl: null,
    note: "用 ChatGPT Plus / Pro / Business 订阅额度调用 GPT 模型，添加后登录 ChatGPT 账号即可，不需要 API Key。额度与 Codex 共用，用完需等待重置。",
    models: ["gpt-6.1-sol", "gpt-6-sol", "gpt-6-astra", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  },
  {
    id: "kimi-coding",
    icon: "kimi",
    name: "Kimi For Coding",
    protocol: "anthropic",
    kind: "plan",
    baseUrl: "https://api.kimi.com/coding",
    keyUrl: "https://www.kimi.com/coding",
    note: "Kimi 会员的编程套餐，使用套餐专属 Key。",
    models: [],
  },
  {
    id: "glm-coding",
    icon: "zhipu",
    name: "智谱 GLM Coding Plan",
    protocol: "anthropic",
    kind: "plan",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    note: "订阅 GLM Coding Plan 后，用同一账号的 API Key 即可按套餐计费。",
    models: [],
  },
  {
    id: "bailian-coding",
    icon: "bailian",
    name: "阿里云百炼 Coding Plan",
    protocol: "anthropic",
    kind: "plan",
    baseUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    keyUrl: "https://bailian.console.aliyun.com/",
    note: "使用 Coding Plan 专属 Key（与普通百炼 Key 不同）。",
    models: [],
  },
  {
    id: "minimax-coding",
    icon: "minimax",
    name: "MiniMax Coding Plan",
    protocol: "anthropic",
    kind: "plan",
    baseUrl: "https://api.minimaxi.com/anthropic",
    keyUrl: "https://platform.minimaxi.com/user-center/payment/coding-plan",
    note: "使用 Coding Plan 专属 Key。",
    models: [],
  },
  {
    id: "volcengine-coding",
    icon: "volcengine",
    name: "火山方舟 Coding Plan",
    protocol: "anthropic",
    kind: "plan",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    keyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    note: "订阅方舟 Coding Plan 后使用方舟 API Key。",
    models: [],
  },
  { id: "custom", icon: null, name: "自定义", protocol: "openai", kind: "api", baseUrl: null, models: [] },
];

export const PRESETS: Preset[] = [...LEGACY_PRESETS.map(p => {
  const upstream = CC_SWITCH_PRESETS.find(x => x.protocol === p.protocol && x.baseUrl?.replace(/\/+$/, "") === p.baseUrl?.replace(/\/+$/, ""));
  return upstream ? { ...p, group: upstream.group, family: upstream.family, familyName: upstream.familyName, plan: upstream.plan, region: upstream.region, source: upstream.source, options: p.options ?? upstream.options, modelsUrl: p.modelsUrl ?? upstream.modelsUrl, models: [...new Set([...p.models, ...upstream.models])], modelDefaults: upstream.modelDefaults } : p;
}), ...CC_SWITCH_PRESETS.filter(p => !LEGACY_PRESETS.some(x => x.protocol === p.protocol && x.baseUrl?.replace(/\/+$/, "") === p.baseUrl?.replace(/\/+$/, "")))];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}


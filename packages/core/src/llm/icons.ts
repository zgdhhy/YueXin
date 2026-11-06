import { ICON_ASSETS } from "./icon-assets";

/** 厂商图标：使用本地清单，不猜测文件扩展名或外部网址。 */
const LLM_ICONS = [
  ["claude", "Claude"],
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["codex", "Codex"],
  ["gemini", "Gemini"],
  ["google", "Google"],
  ["deepseek", "DeepSeek"],
  ["qwen", "通义千问"],
  ["bailian", "阿里云百炼"],
  ["kimi", "Kimi"],
  ["moonshot", "Moonshot"],
  ["zhipu", "智谱"],
  ["chatglm", "ChatGLM"],
  ["minimax", "MiniMax"],
  ["doubao", "豆包"],
  ["volcengine", "火山引擎"],
  ["hunyuan", "腾讯混元"],
  ["wenxin", "文心"],
  ["stepfun", "阶跃星辰"],
  ["grok", "Grok"],
  ["mistral", "Mistral"],
  ["meta", "Meta"],
  ["openrouter", "OpenRouter"],
  ["siliconcloud", "硅基流动"],
  ["ollama", "Ollama"],
  ["newapi", "New API"],
] as const;

export type LlmIcon = (typeof LLM_ICONS)[number][0] | keyof typeof ICON_ASSETS;

const ICON_IDS = new Set<string>([...LLM_ICONS.map(([id]) => id), ...Object.keys(ICON_ASSETS)]);
export const isLlmIcon = (s: string | null | undefined): s is LlmIcon => !!s && ICON_IDS.has(s);
export function iconAsset(id: LlmIcon) { return `/llm-icons/${ICON_ASSETS[id as keyof typeof ICON_ASSETS]?.file ?? `${id}.svg`}`; }
export const PROVIDER_ICONS = Object.entries(ICON_ASSETS).map(([id,value])=>({id:id as LlmIcon,name:value.name})).sort((a,b)=>a.name.localeCompare(b.name));

/** 按地址或名称猜服务商图标，用于未选图标的自定义服务商 */
const PROVIDER_RULES: [RegExp, LlmIcon][] = [
  [/anthropic|claude/, "anthropic"],
  [/chatgpt\.com|codex/, "codex"],
  [/openai\.com/, "openai"],
  [/deepseek/, "deepseek"],
  [/dashscope|aliyun|百炼|bailian/, "bailian"],
  [/moonshot|kimi/, "kimi"],
  [/bigmodel|zhipu|智谱/, "zhipu"],
  [/minimax/, "minimax"],
  [/volces|volcengine|火山|豆包/, "volcengine"],
  [/openrouter/, "openrouter"],
  [/siliconflow|硅基/, "siliconcloud"],
  [/googleapis|gemini/, "gemini"],
  [/ollama|localhost:11434/, "ollama"],
];

export function guessProviderIcon(p: { name: string; baseUrl: string | null }): LlmIcon | null {
  const s = `${p.baseUrl ?? ""} ${p.name}`.toLowerCase();
  return PROVIDER_RULES.find(([re]) => re.test(s))?.[1] ?? null;
}

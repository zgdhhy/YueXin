import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { fetchWithRetry } from "./http";
import { nonNullHeaders, providerHeaders, redactProviderError } from "./llm/connection";

/**
 * 旁白语音合成：使用模型页里 OpenAI 兼容的服务商（POST {baseUrl}/audio/speech）。
 * 返回 WAV，时长可以直接从文件头算出，用来让字幕与语音对齐。
 * （原计划的 Edge TTS 在 2026-10 更换了校验算法，暂不可用。）
 */
export type NarrationConfig = { providerId: number | null; model: string; voice: string; speed: number };

/** 能合成旁白的服务商：OpenAI 兼容协议 */
export function narrationProviders() {
  return db.select().from(schema.llmProviders).all().filter((p) => p.enabled && (p.protocol === "openai" || p.protocol === "responses"));
}

/** WAV 的时长（秒）：data 块大小 ÷ 每秒字节数 */
export function wavDuration(buf: Buffer) {
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("语音不是 WAV 格式");
  const byteRate = buf.readUInt32LE(28);
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString("ascii", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    // 流式返回的 WAV 可能把 data 长度写成占位值，以实际剩余字节为准
    if (id === "data") return Math.min(size, buf.length - i - 8) / byteRate;
    i += 8 + size + (size % 2);
  }
  throw new Error("WAV 缺少 data 块");
}

export async function synthesizeSpeech(text: string, cfg: NarrationConfig): Promise<{ audio: Buffer; durationSec: number }> {
  if (!cfg.providerId || !cfg.model) throw new Error("旁白还没有选择服务商和模型");
  const p = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, cfg.providerId)).get();
  if (!p || !p.enabled) throw new Error("旁白服务商不存在或已停用");
  const base = (p.options?.fullUrl ? new URL(p.baseUrl!).origin + "/v1" : p.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetchWithRetry(`${base}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", ...nonNullHeaders(providerHeaders(p)) },
    body: JSON.stringify({ model: cfg.model, input: text, voice: cfg.voice || "alloy", response_format: "wav", speed: cfg.speed || 1 }),
  });
  if (!res.ok) throw new Error(redactProviderError(`语音合成失败 HTTP ${res.status}：${(await res.text()).slice(0, 300)}`, p));
  const audio = Buffer.from(await res.arrayBuffer());
  return { audio, durationSec: wavDuration(audio) };
}

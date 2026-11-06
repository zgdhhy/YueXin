import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";

export const selectionSchema = z.object({
  sources: z.object({ hf: z.boolean(), arxiv: z.boolean() }),
  /** 新论文回看天数 */
  lookbackDays: z.number().int().min(1).max(60),
  /** 推荐名额中留给近期重要论文的比例 */
  notableRatio: z.number().min(0).max(1),
  /** 近期重要论文回看范围（天），不含 lookbackDays 内的 */
  notableLookbackDays: z.number().int().min(14).max(730),
  alternates: z.number().int().min(0).max(5),
  shortlistSize: z.number().int().min(5).max(60),
  /** 头部机构，命中加分 */
  institutions: z.array(z.string()),
});

/** 调用大模型的环节；chat（对话）供助手与论文追问使用，不在运行中出现 */
const STAGES = ["rerank", "digest", "storyboard", "code", "report", "chat"] as const;
export type Stage = (typeof STAGES)[number];

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

const stageConfigSchema = z.object({
  /** llm_models.id；为空时用第一个可用模型 */
  modelId: z.number().int().nullable(),
  /** 主模型失败（重试后仍失败）时改用的模型 */
  fallbackModelId: z.number().int().nullable(),
});

const stagesSchema = z.object({
  rerank: stageConfigSchema,
  digest: stageConfigSchema,
  storyboard: stageConfigSchema,
  report: stageConfigSchema,
});

export const videoSchema = z.object({
  enabled: z.boolean(),
  musicMode: z.enum(["none", "library", "procedural"]),
  musicVolume: z.number().min(0).max(1),
  /** 中文字幕阅读速度（字/秒） */
  readingSpeed: z.number().min(2).max(12),
  /** auto：写讲解脚本时由大模型从启用的风格里挑；fixed：固定用 styleId */
  styleMode: z.enum(["auto", "fixed"]),
  styleId: z.number().int().nullable(),
  /** 旁白：用 OpenAI 兼容服务商的语音合成朗读字幕 */
  narration: z.object({
    enabled: z.boolean(),
    providerId: z.number().int().nullable(),
    model: z.string(),
    voice: z.string(),
    speed: z.number().min(0.5).max(2),
  }),
});

const defs = {
  selection: {
    schema: selectionSchema,
    default: {
      sources: { hf: true, arxiv: true },
      lookbackDays: 7,
      notableRatio: 0.2,
      notableLookbackDays: 180,
      alternates: 3,
      shortlistSize: 20,
      institutions: [
        "Google", "DeepMind", "OpenAI", "Anthropic", "Meta", "FAIR", "Microsoft", "NVIDIA", "Apple",
        "DeepSeek", "Qwen", "Alibaba", "ByteDance", "Moonshot", "Tencent", "Zhipu", "MiniMax",
        "Stanford", "MIT", "Berkeley", "CMU", "Princeton", "Tsinghua", "Peking", "Shanghai AI Lab",
      ],
    } satisfies z.infer<typeof selectionSchema>,
  },
  stages: {
    schema: stagesSchema,
    default: {
      rerank: { modelId: null, fallbackModelId: null },
      digest: { modelId: null, fallbackModelId: null },
      storyboard: { modelId: null, fallbackModelId: null },
      report: { modelId: null, fallbackModelId: null },
    } satisfies z.infer<typeof stagesSchema>,
  },
  video: {
    schema: videoSchema,
    default: {
      enabled: true,
      musicMode: "procedural",
      musicVolume: 0.25,
      readingSpeed: 5,
      styleMode: "auto",
      styleId: null,
      narration: { enabled: false, providerId: null, model: "", voice: "", speed: 1 },
    } satisfies z.infer<
      typeof videoSchema
    >,
  },
} as const;

type Defs = typeof defs;
export type SettingKey = keyof Defs;
export type SettingValue<K extends SettingKey> = z.infer<Defs[K]["schema"]>;

function readRow(key: string) {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
}

/** 旧版 stageModels（环节 → 服务商 id）迁移为 stages；迁移时模型沿用了服务商 id */
function legacyStages(): SettingValue<"stages"> | null {
  const old = readRow("stageModels")?.value as Partial<Record<Stage, number | null>> | undefined;
  if (!old) return null;
  const d = defs.stages.default;
  return {
    rerank: { ...d.rerank, modelId: old.rerank ?? null },
    digest: { ...d.digest, modelId: old.digest ?? null },
    storyboard: { ...d.storyboard, modelId: old.storyboard ?? null },
    report: { ...d.report, modelId: old.digest ?? null },
  };
}

export function getSetting<K extends SettingKey>(key: K): SettingValue<K> {
  const row = readRow(key);
  const def = defs[key];
  if (!row) return ((key === "stages" && legacyStages()) || def.default) as SettingValue<K>;
  // 新增字段时用默认值补齐
  const parsed = def.schema.safeParse({ ...def.default, ...(row.value as object) });
  return (parsed.success ? parsed.data : def.default) as SettingValue<K>;
}

export function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>) {
  const v = defs[key].schema.parse(value);
  db.insert(schema.settings)
    .values({ key, value: v })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: v } })
    .run();
}

const HEARTBEAT_KEY = "workerHeartbeat";

/** worker 定期写入心跳，后台据此显示 worker 是否在线 */
export function touchHeartbeat() {
  const value = { at: new Date().toISOString() };
  db.insert(schema.settings)
    .values({ key: HEARTBEAT_KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export function getHeartbeat(): Date | null {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, HEARTBEAT_KEY)).get();
  return row ? new Date((row.value as { at: string }).at) : null;
}

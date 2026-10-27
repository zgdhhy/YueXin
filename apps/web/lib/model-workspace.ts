import "server-only";
import { gte, sql } from "drizzle-orm";
import { db, schema, getSetting, PRESETS, guessProviderIcon, isLlmIcon, getModelPolicy, resolvedStage, MODEL_STAGES, modelVerification, modelUsage } from "@paper/core";

/** 浏览器只接收配置摘要；密钥、访问令牌和 PKCE 状态不离开服务器。 */
export function modelWorkspace() {
  const providers = db.select().from(schema.llmProviders).orderBy(schema.llmProviders.id).all().map((p) => {
    const pending = p.oauth?.pending;
    return {
      id: p.id, name: p.name, preset: p.preset, protocol: p.protocol, baseUrl: p.baseUrl,
      authType: p.authType, enabled: p.enabled, icon: p.icon && isLlmIcon(p.icon) ? p.icon : PRESETS.find((x) => x.id === p.preset)?.icon ?? guessProviderIcon(p),
      options: p.options ? (({ headers: _, ...rest }) => rest)(p.options) : null,
      headerNames: Object.keys(p.options?.headers ?? {}),
      hasKey: !!p.apiKey, connected: !!p.oauth?.access,
      customIcon: p.icon && isLlmIcon(p.icon) ? p.icon : null,
      account: p.oauth?.email ?? p.oauth?.accountId ?? null, plan: p.oauth?.plan ?? null,
      pending: pending ? (pending.method === "device"
        ? { method: "device" as const, userCode: pending.userCode, interval: pending.interval, startedAt: pending.startedAt }
        : { method: "browser" as const, url: pending.url, startedAt: pending.startedAt }) : null,
    };
  });
  const models = db.select().from(schema.llmModels).orderBy(schema.llmModels.id).all().map((m) => ({ ...m, verification: modelVerification(m.id), usage: modelUsage([m.id]) }));
  const usage = db.select({
    calls: sql<number>`count(*)`,
    errors: sql<number>`coalesce(sum(case when ${schema.llmCalls.status} = 'error' then 1 else 0 end), 0)`,
    input: sql<number>`coalesce(sum(${schema.llmCalls.inputTokens}),0)`,
    output: sql<number>`coalesce(sum(${schema.llmCalls.outputTokens}),0)`,
    cost: sql<number>`coalesce(sum(${schema.llmCalls.costUsd}),0)`,
  }).from(schema.llmCalls).where(gte(schema.llmCalls.createdAt, new Date(Date.now() - 30 * 86400_000).toISOString())).get()!;
  const policy = getModelPolicy();
  const resolved = Object.fromEntries(MODEL_STAGES.map((stage) => [stage, resolvedStage(stage, policy)])) as Record<typeof MODEL_STAGES[number], ReturnType<typeof resolvedStage>>;
  return { providers, models, policy, resolved, legacyStages: getSetting("stages"), presets: PRESETS, usage, revision: Date.now() };
}

export type WorkspaceData = ReturnType<typeof modelWorkspace>;
export type WorkspaceProvider = WorkspaceData["providers"][number];
export type WorkspaceModel = WorkspaceData["models"][number];

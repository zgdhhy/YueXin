import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db, schema, getPreset, lookupModel, EFFORTS, PROTOCOLS, providerOptionsSchema, providerSecrets, supportsEffort, isLlmIcon,
  normalizeProviderBaseUrl, getModelPolicy, saveModelPolicy, stagePolicySchema, targetIssue, resolvedStage, assertNotRunning, beginVerification, finishVerification,
  listRemoteModels, testModel, startDeviceLogin, startBrowserLogin, pollDeviceLogin,
  completeBrowserLogin, parseCodexAuthJson, type OAuthState,
  MODEL_STAGES,
} from "@paper/core";
import { getSession } from "@/lib/auth";
import { modelWorkspace } from "@/lib/model-workspace";

export const dynamic = "force-dynamic";
const id = z.number().int().positive();
const endpoint = z.string().trim().max(2048).refine((s) => {
  if (!s) return true;
  try { const url = new URL(s); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, "地址需要是完整的 http:// 或 https:// URL");
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("save-provider"), id: id.optional(), preset: z.string(), name: z.string().trim().min(1).max(100), icon: z.string().refine(isLlmIcon,"请选择可用的本地图标").nullable().optional(), baseUrl: endpoint, protocol: z.enum(PROTOCOLS), options: providerOptionsSchema.optional(), clearHeaders: z.boolean().optional(), apiKey: z.string().trim().max(16384), clientRequestId: z.string().uuid().optional() }),
  z.object({ action: z.literal("toggle-provider"), id, enabled: z.boolean() }),
  z.object({ action: z.literal("delete-provider"), id }),
  z.object({ action: z.literal("remote-models"), id }),
  z.object({ action: z.literal("add-models"), id, models: z.array(z.string().trim().min(1).max(200)).min(1).max(200), metadata: z.array(z.object({modelId:z.string().max(200),displayName:z.string().max(100).optional(),maxOutputTokens:z.number().int().min(256).max(2000000).optional(),contextWindow:z.number().int().positive().max(100000000).optional()})).max(200).optional() }),
  z.object({ action: z.literal("save-model"), id, displayName: z.string().trim().max(100), upstreamModelId: z.string().trim().max(200).nullable().optional(), contextWindow: z.number().int().positive().max(100000000).nullable().optional(), maxOutputTokens: z.number().int().min(256).max(2000000), effort: z.enum(EFFORTS).nullable(), priceInput: z.number().min(0).nullable(), priceOutput: z.number().min(0).nullable() }),
  z.object({ action: z.literal("toggle-model"), id, enabled: z.boolean() }),
  z.object({ action: z.literal("delete-model"), id }),
  z.object({ action: z.literal("test"), id }),
  z.object({ action: z.literal("defaults"), defaultModelId: id, fallbackModelId: id.nullable(), revision: z.number().int() }),
  z.object({ action: z.literal("stage"), stage: z.enum(MODEL_STAGES), policy: stagePolicySchema, revision: z.number().int() }),
  z.object({ action: z.literal("oauth-start"), id, method: z.enum(["device", "browser"]) }),
  z.object({ action: z.literal("oauth-poll"), id }),
  z.object({ action: z.literal("oauth-complete"), id, input: z.string().trim().min(1).max(100000) }),
  z.object({ action: z.literal("oauth-clear"), id, logout: z.boolean() }),
]);

function provider(providerId: number) {
  const p = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, providerId)).get();
  if (!p) throw new Error("服务商已不存在，请刷新列表");
  return p;
}
function model(modelId: number) {
  const m = db.select().from(schema.llmModels).where(eq(schema.llmModels.id, modelId)).get();
  if (!m) throw new Error("模型已不存在，请刷新列表");
  return m;
}
function oauthSave(providerId: number, oauth: OAuthState | null) {
  db.update(schema.llmProviders).set({ oauth }).where(eq(schema.llmProviders.id, providerId)).run();
}
const reply = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  if (!(await getSession()).loggedIn) return reply({ error: "登录已过期，请重新登录" }, 401);
  return reply({ data: modelWorkspace() });
}

export async function POST(req: Request) {
  if (!(await getSession()).loggedIn) return reply({ error: "登录已过期，请重新登录" }, 401);
  // Cookie 认证的写入只接受同源 JSON 请求。
  if (req.headers.get("origin") !== new URL(req.url).origin || !req.headers.get("content-type")?.includes("application/json")) return reply({ error: "无效请求来源" }, 403);
  let secrets: string[] = [];
  try {
    const c = command.parse(await req.json());
    let selectedId: number | undefined;
    let addedModelIds: number[] | undefined;
    switch (c.action) {
      case "refresh": break;
      case "save-provider": {
        const preset = getPreset(c.preset);
        if (!preset) throw new Error("请选择有效的服务商模板");
        const remembered = c.clientRequestId ? db.select().from(schema.settings).where(eq(schema.settings.key, `providerRequest:${c.clientRequestId}`)).get()?.value as { id: number } | undefined : undefined;
        const existing = c.id ? provider(c.id) : remembered && db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, remembered.id)).get();
        const oauth = preset.authType === "oauth";
        if (existing && existing.authType !== (oauth ? "oauth" : "api_key")) throw new Error("认证方式不能直接切换，请新建服务商");
        if (preset.id === "custom" && !c.baseUrl) throw new Error("自定义服务商需要填写接口地址");
        if (!oauth && c.protocol === "codex") throw new Error("Codex 订阅协议需要使用账号登录模板");
        const protocol = oauth ? "codex" as const : c.protocol;
        const options = { ...(existing ? existing.options ?? {} : preset.options ?? {}), ...c.options };
        if (options.reasoning === "thinking" && protocol !== "openai") throw new Error("thinking 开关仅用于 Chat Completions 接口");
        if (options.reasoning === "effort" && protocol === "gemini") throw new Error("Gemini 原生接口暂不支持单独设置思考强度");
        if (c.clearHeaders) delete options.headers;
        if (!oauth && !c.apiKey && !existing?.apiKey && !preset.keyOptional && options.authMode !== "none" && !Object.keys(options.headers ?? {}).length) throw new Error("请填写 API Key");
        if (oauth && (options.headers || options.authMode && options.authMode !== "auto")) throw new Error("订阅认证由账号管理，不能覆盖其认证请求头");
        if (options.fullUrl && !c.baseUrl) throw new Error("完整端点模式必须填写接口地址");
        secrets = [c.apiKey, ...Object.values(options.headers ?? {})];
        const values = { name: c.name, preset: preset.id, ...(c.icon!==undefined?{icon:c.icon}:{}), baseUrl: normalizeProviderBaseUrl(c.baseUrl, protocol, options.fullUrl) || null, protocol, options, authType: oauth ? "oauth" as const : "api_key" as const };
        if (existing) {
          db.update(schema.llmProviders).set({ ...values, ...(c.apiKey ? { apiKey: c.apiKey } : {}) }).where(eq(schema.llmProviders.id, existing.id)).run();
          selectedId = existing.id;
        } else selectedId = db.insert(schema.llmProviders).values({ ...values, apiKey: c.apiKey }).returning({ id: schema.llmProviders.id }).get().id;
        if (c.clientRequestId) db.insert(schema.settings).values({ key: `providerRequest:${c.clientRequestId}`, value: { id: selectedId } }).onConflictDoNothing().run();
        break;
      }
      case "toggle-provider": provider(c.id); db.update(schema.llmProviders).set({ enabled: c.enabled }).where(eq(schema.llmProviders.id, c.id)).run(); break;
      case "delete-provider": {
        provider(c.id);
        db.transaction(() => {
          const ids = db.select({ id: schema.llmModels.id }).from(schema.llmModels).where(eq(schema.llmModels.providerId, c.id)).all().map((m) => m.id);
          assertNotRunning(ids);
          db.delete(schema.llmModels).where(eq(schema.llmModels.providerId, c.id)).run();
          db.delete(schema.llmProviders).where(eq(schema.llmProviders.id, c.id)).run();
        });
        break;
      }
      case "remote-models": {
        const p = provider(c.id); secrets = providerSecrets(p);
        const preset = getPreset(p.preset);
        const sameHost = !p.baseUrl || !preset?.baseUrl || new URL(p.baseUrl).origin === new URL(preset.baseUrl).origin;
        const remote = await listRemoteModels(p, sameHost ? preset?.modelsUrl : undefined);
        return reply({ models: remote });
      }
      case "add-models": {
        const p = provider(c.id);
        db.transaction(() => {
          for (const modelId of new Set(c.models)) {
            const known = lookupModel(modelId);
            const defaults = getPreset(p.preset)?.modelDefaults?.[modelId];
            const remote = c.metadata?.find(m=>m.modelId === modelId);
            db.insert(schema.llmModels).values({ providerId: p.id, modelId, displayName: remote?.displayName ?? defaults?.displayName ?? known?.name ?? null, contextWindow: remote?.contextWindow ?? defaults?.contextWindow ?? null, maxOutputTokens: remote?.maxOutputTokens ?? defaults?.maxOutputTokens ?? known?.maxOutputTokens ?? 32000, effort: p.protocol === "codex" || modelId.startsWith("claude-") ? "high" : null, priceInput: p.authType === "oauth" ? null : known?.priceInput ?? null, priceOutput: p.authType === "oauth" ? null : known?.priceOutput ?? null }).onConflictDoNothing().run();
          }
        });
        addedModelIds = db.select().from(schema.llmModels).where(eq(schema.llmModels.providerId, c.id)).all().filter((m) => c.models.includes(m.modelId)).map((m) => m.id);
        break;
      }
      case "save-model": {
        const m = model(c.id); const p = provider(m.providerId);
        db.update(schema.llmModels).set({ displayName: c.displayName || null, ...(c.upstreamModelId !== undefined ? { upstreamModelId: c.upstreamModelId || null } : {}), ...(c.contextWindow !== undefined ? { contextWindow: c.contextWindow } : {}), maxOutputTokens: c.maxOutputTokens, effort: supportsEffort(p, { ...m, upstreamModelId: c.upstreamModelId ?? m.upstreamModelId }) ? c.effort : null, priceInput: p.authType === "oauth" ? null : c.priceInput, priceOutput: p.authType === "oauth" ? null : c.priceOutput }).where(eq(schema.llmModels.id, c.id)).run(); break;
      }
      case "toggle-model": model(c.id); db.update(schema.llmModels).set({ enabled: c.enabled }).where(eq(schema.llmModels.id, c.id)).run(); break;
      case "delete-model": model(c.id); db.transaction(() => { assertNotRunning([c.id]); db.delete(schema.llmModels).where(eq(schema.llmModels.id, c.id)).run(); }); break;
      case "test": {
        const m = model(c.id); const p = provider(m.providerId); secrets = [p.apiKey, p.oauth?.access ?? "", p.oauth?.refresh ?? ""];
        const start = beginVerification(c.id);
        try {
          const result = await testModel(c.id);
          if (!result.text.trim()) throw new Error("服务商返回了空内容，连接尚未验证通过");
          const current = finishVerification(c.id, start, { latencyMs: result.latencyMs });
          if (!current) return reply({ error: "测试期间配置已改变，请重新测试", data: modelWorkspace() }, 409);
          return reply({ result: { latencyMs: result.latencyMs, text: result.text.slice(0, 200) }, data: modelWorkspace() });
        } catch (e) {
          let error = e instanceof Error ? e.message : "模型验证失败";
          for (const secret of secrets.filter(Boolean)) error = error.split(secret).join("***");
          finishVerification(c.id, start, { error: error.slice(0, 1200) });
          return reply({ error: error.slice(0, 1200), data: modelWorkspace() }, 400);
        }
      }
      case "defaults": {
        const policy = getModelPolicy();
        if (policy.revision !== c.revision) return reply({ error: "配置已在其他位置更新，请刷新后重试", data: modelWorkspace() }, 409);
        const issue = targetIssue(c.defaultModelId); if (issue) throw new Error(`默认模型：${issue}`);
        if (c.fallbackModelId) { const problem = targetIssue(c.fallbackModelId); if (problem) throw new Error(`备用模型：${problem}`); }
        if (c.defaultModelId === c.fallbackModelId) throw new Error("主模型与备用模型不能相同");
        saveModelPolicy({ ...policy, confirmed: true, defaultModelId: c.defaultModelId, fallbackModelId: c.fallbackModelId }); break;
      }
      case "stage": {
        const policy = getModelPolicy();
        if (policy.revision !== c.revision) return reply({ error: "配置已在其他位置更新，请刷新后重试", data: modelWorkspace() }, 409);
        const next = { ...policy, stages: { ...policy.stages, [c.stage]: c.policy } };
        const resolved = resolvedStage(c.stage, next);
        if (resolved.issues.length) throw new Error(resolved.issues.join("；"));
        const primary = model(resolved.primaryId!); const p = provider(primary.providerId);
        if (p.protocol === "codex" && c.policy.outputTokens != null) throw new Error("该订阅接口不支持设置输出上限");
        if (c.policy.effort && !supportsEffort(p,primary)) throw new Error("该适配器不支持设置思考强度");
        saveModelPolicy(next); break;
      }
      case "oauth-start": {
        const p = provider(c.id); if (p.authType !== "oauth") throw new Error("该服务商不使用订阅登录");
        const pending = c.method === "device" ? await startDeviceLogin() : startBrowserLogin();
        // 等待网络时可能已被删除；重新检查，避免把旧状态写回。
        const latest = provider(c.id); oauthSave(p.id, { ...latest.oauth, pending }); break;
      }
      case "oauth-poll": {
        const p = provider(c.id); const pending = p.oauth?.pending;
        if (!pending && p.oauth?.access) return reply({ data: modelWorkspace() });
        const next = await pollDeviceLogin(pending);
        if (!next) return reply({ pending: true });
        const latest = provider(c.id);
        if (latest.oauth?.pending?.startedAt !== pending?.startedAt) throw new Error("登录请求已取消或更新");
        oauthSave(p.id, next); break;
      }
      case "oauth-complete": {
        const p = provider(c.id);
        if (p.authType !== "oauth") throw new Error("该服务商不使用订阅登录");
        const next = c.input.startsWith("{") ? parseCodexAuthJson(c.input) : await completeBrowserLogin(p.oauth?.pending, c.input);
        const latest = provider(c.id);
        if (!c.input.startsWith("{") && latest.oauth?.pending?.startedAt !== p.oauth?.pending?.startedAt) throw new Error("登录请求已取消或更新");
        oauthSave(p.id, next); break;
      }
      case "oauth-clear": {
        const p = provider(c.id); const { pending: _, ...rest } = p.oauth ?? {};
        oauthSave(p.id, c.logout ? null : rest.access ? rest : null); break;
      }
    }
    return reply({ data: modelWorkspace(), selectedId, addedModelIds });
  } catch (e) {
    let error = e instanceof z.ZodError ? e.issues.map((i) => i.message).join("；") : e instanceof Error ? e.message : "操作失败，请稍后重试";
    for (const secret of secrets.filter(Boolean)) error = error.split(secret).join("***");
    return reply({ error: error.slice(0, 1200), fields: e instanceof z.ZodError ? Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message])) : undefined }, 400);
  }
}

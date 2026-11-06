/**
 * ChatGPT 订阅（Codex）OAuth 登录与令牌刷新。
 * 流程参考 pi-ai（MIT License，https://github.com/earendil-works/pi）的 openai-codex OAuth 实现：
 * 使用 Codex CLI 的公开 client id + PKCE，令牌直接调用 chatgpt.com/backend-api/codex。
 */
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { OAuthState } from "../db/schema";
import { explainNetworkError } from "../http";

type Provider = typeof schema.llmProviders.$inferSelect;

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE = "https://auth.openai.com";
const AUTHORIZE_URL = `${AUTH_BASE}/oauth/authorize`;
const TOKEN_URL = `${AUTH_BASE}/oauth/token`;
/** Codex CLI 注册的回调地址；服务器上访问不到，登录后从地址栏复制完整 URL 粘贴回来即可 */
const CODEX_REDIRECT_URI = "http://localhost:1455/auth/callback";
const DEVICE_USER_CODE_URL = `${AUTH_BASE}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${AUTH_BASE}/api/accounts/deviceauth/token`;
const DEVICE_REDIRECT_URI = `${AUTH_BASE}/deviceauth/callback`;
/** 设备码 15 分钟内有效 */
const DEVICE_CODE_TTL_MS = 15 * 60_000;
const SCOPE = "openid profile email offline_access";
const JWT_AUTH_CLAIM = "https://api.openai.com/auth";
const JWT_PROFILE_CLAIM = "https://api.openai.com/profile";
/** 提前这么久刷新，避免请求途中令牌过期 */
const EXPIRY_MARGIN_MS = 5 * 60_000;

// ---------- 令牌 ----------

/** 请求 OpenAI 认证服务；连不上时给出代理设置的提示 */
async function authFetch(url: string, init: RequestInit): Promise<Response> {
  const host = new URL(url).host;
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new Error(explainNetworkError(e, host) ?? `请求 ${host} 失败：${String(e)}`);
  }
  if (res.status === 403) {
    const body = await res.clone().text();
    const region = explainNetworkError(new Error(body), host);
    if (region) throw new Error(region);
  }
  return res;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    return part ? (JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 从访问令牌（及可选的 id_token）中取出账号信息 */
function tokenInfo(access: string, idToken?: string) {
  const claims = { ...decodeJwt(idToken ?? ""), ...decodeJwt(access) };
  const auth = (claims[JWT_AUTH_CLAIM] ?? {}) as { chatgpt_account_id?: string; chatgpt_plan_type?: string };
  const profile = (claims[JWT_PROFILE_CLAIM] ?? {}) as { email?: string };
  if (!auth.chatgpt_account_id) throw new Error("令牌中没有 ChatGPT 账号 id，请确认使用的是 ChatGPT 账号登录");
  const email = profile.email ?? (typeof claims.email === "string" ? claims.email : undefined);
  const exp = typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
  return { accountId: auth.chatgpt_account_id, plan: auth.chatgpt_plan_type, email, exp };
}

async function requestToken(body: Record<string, string>): Promise<OAuthState> {
  const res = await authFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(body)
  });
  if (!res.ok) throw new Error(`OpenAI 令牌请求失败（HTTP ${res.status}）：${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number };
  if (!json.access_token || !json.refresh_token) throw new Error("OpenAI 令牌响应缺少 access_token / refresh_token");
  const info = tokenInfo(json.access_token, json.id_token);
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : (info.exp ?? Date.now() + 3600_000),
    accountId: info.accountId,
    email: info.email,
    plan: info.plan,
  };
}

const exchangeCode = (code: string, verifier: string, redirectUri: string) =>
  requestToken({ grant_type: "authorization_code", client_id: CLIENT_ID, code, code_verifier: verifier, redirect_uri: redirectUri });

// ---------- 浏览器登录（PKCE，粘贴回调地址） ----------

export function startBrowserLogin(): NonNullable<OAuthState["pending"]> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: CODEX_REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "paper_web",
  }).toString();
  return { method: "browser", verifier, state, url: url.toString(), startedAt: Date.now() };
}

/** 接受完整回调地址、code=...&state=... 或单独的 code */
function parseCallback(input: string): { code?: string; state?: string } {
  const v = input.trim();
  try {
    const u = new URL(v);
    return { code: u.searchParams.get("code") ?? undefined, state: u.searchParams.get("state") ?? undefined };
  } catch {
    // 不是 URL
  }
  if (v.includes("code=")) {
    const q = new URLSearchParams(v.replace(/^[^?]*\?/, ""));
    return { code: q.get("code") ?? undefined, state: q.get("state") ?? undefined };
  }
  return { code: v || undefined };
}

export async function completeBrowserLogin(pending: OAuthState["pending"], input: string): Promise<OAuthState> {
  if (pending?.method !== "browser") throw new Error("没有进行中的浏览器登录，请重新开始");
  const { code, state } = parseCallback(input);
  if (!code) throw new Error("没有找到授权码，请粘贴登录后浏览器地址栏中的完整地址");
  if (state && state !== pending.state) throw new Error("state 不匹配，请重新开始登录");
  return exchangeCode(code, pending.verifier, CODEX_REDIRECT_URI);
}

// ---------- 设备码登录（适合服务器） ----------

export async function startDeviceLogin(): Promise<NonNullable<OAuthState["pending"]>> {
  const res = await authFetch(DEVICE_USER_CODE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID })
  });
  if (res.status === 404) throw new Error("OpenAI 暂未开放设备码登录，请改用浏览器登录");
  if (!res.ok) throw new Error(`获取设备码失败（HTTP ${res.status}）：${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { device_auth_id?: string; user_code?: string; interval?: number | string };
  const interval = Number(json.interval ?? 5);
  if (!json.device_auth_id || !json.user_code) throw new Error(`设备码响应无效：${JSON.stringify(json).slice(0, 300)}`);
  return {
    method: "device",
    deviceAuthId: json.device_auth_id,
    userCode: json.user_code,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 5,
    startedAt: Date.now(),
  };
}

/** 查询一次设备码授权结果；用户尚未确认时返回 null */
export async function pollDeviceLogin(pending: OAuthState["pending"]): Promise<OAuthState | null> {
  if (pending?.method !== "device") throw new Error("没有进行中的设备码登录，请重新开始");
  if (Date.now() - pending.startedAt > DEVICE_CODE_TTL_MS) throw new Error("设备码已过期，请重新开始登录");
  const res = await authFetch(DEVICE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_auth_id: pending.deviceAuthId, user_code: pending.userCode })
  });
  if (res.ok) {
    const json = (await res.json()) as { authorization_code?: string; code_verifier?: string };
    if (!json.authorization_code || !json.code_verifier) throw new Error("设备码授权响应无效");
    return exchangeCode(json.authorization_code, json.code_verifier, DEVICE_REDIRECT_URI);
  }
  if (res.status === 403 || res.status === 404) return null;
  const text = await res.text();
  if (/authorization_pending|slow_down/.test(text)) return null;
  throw new Error(`设备码登录失败（HTTP ${res.status}）：${text.slice(0, 300)}`);
}

// ---------- 导入 Codex CLI 的 auth.json ----------

/** 解析 ~/.codex/auth.json（{ tokens: { access_token, refresh_token, id_token, account_id } }） */
export function parseCodexAuthJson(text: string): OAuthState {
  let json: { tokens?: { access_token?: string; refresh_token?: string; id_token?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON，请粘贴 ~/.codex/auth.json 的完整内容");
  }
  const t = json.tokens;
  if (!t?.access_token || !t.refresh_token) throw new Error("auth.json 中没有 tokens（是否用 API Key 登录的 Codex？）");
  const info = tokenInfo(t.access_token, t.id_token);
  // 过期时间未知时视为已过期，首次调用会先刷新
  return { access: t.access_token, refresh: t.refresh_token, expires: info.exp ?? 0, accountId: info.accountId, email: info.email, plan: info.plan };
}

// ---------- 请求时取令牌：过期前自动刷新并写回数据库 ----------

const refreshing = new Map<number, Promise<OAuthState>>();

function loadOAuth(providerId: number): OAuthState | null {
  return db.select({ oauth: schema.llmProviders.oauth }).from(schema.llmProviders).where(eq(schema.llmProviders.id, providerId)).get()?.oauth ?? null;
}

async function refreshProvider(providerId: number): Promise<OAuthState> {
  const current = loadOAuth(providerId);
  if (!current?.refresh) throw new Error("订阅未登录，请在后台「模型」中登录");
  // 其他进程（web / worker）可能已经刷新过
  if (current.access && (current.expires ?? 0) - EXPIRY_MARGIN_MS > Date.now()) return current;
  try {
    const next = await requestToken({ grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: current.refresh });
    // 刷新响应里可能没有邮箱等信息，只覆盖有值的字段
    const defined = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    const merged: OAuthState = { ...current, ...defined, pending: undefined };
    db.update(schema.llmProviders).set({ oauth: merged }).where(eq(schema.llmProviders.id, providerId)).run();
    return merged;
  } catch (e) {
    // refresh token 只能用一次：另一进程抢先刷新时，数据库里已是新令牌
    const latest = loadOAuth(providerId);
    if (latest?.access && latest.access !== current.access && (latest.expires ?? 0) > Date.now()) return latest;
    throw new Error(`订阅令牌刷新失败，请重新登录：${String(e).slice(0, 300)}`);
  }
}

/** 取可用的 OAuth 令牌（必要时刷新） */
export async function oauthToken(p: Pick<Provider, "id" | "oauth">): Promise<Required<Pick<OAuthState, "access" | "accountId">>> {
  let s = loadOAuth(p.id) ?? p.oauth;
  if (!s?.access || !s.accountId) throw new Error("订阅未登录，请在后台「模型」中登录");
  if ((s.expires ?? 0) - EXPIRY_MARGIN_MS <= Date.now()) {
    let job = refreshing.get(p.id);
    if (!job) {
      job = refreshProvider(p.id).finally(() => refreshing.delete(p.id));
      refreshing.set(p.id, job);
    }
    s = await job;
  }
  return { access: s.access!, accountId: s.accountId! };
}

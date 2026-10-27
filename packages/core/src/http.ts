import { ProxyAgent, setGlobalDispatcher } from "undici";
// 先加载 .env，保证无论模块导入顺序如何都能读到 HTTPS_PROXY
import "./env";

const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));

const NETWORK_CODES = /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|ENETUNREACH/;

/** 连不上服务器时给出可操作的说明（国内网络多半是没配代理）；不是网络错误返回 null */
export function explainNetworkError(e: unknown, host: string): string | null {
  const parts: string[] = [];
  for (let cur: unknown = e, i = 0; cur && i < 5; cur = (cur as { cause?: unknown }).cause, i++) {
    const c = cur as { code?: string; name?: string; message?: string };
    parts.push(`${c.code ?? ""} ${c.name ?? ""} ${c.message ?? ""}`);
  }
  const text = parts.join(" ");
  // OpenAI / ChatGPT 对国内 IP 返回 403 unsupported_country_region_territory
  if (/unsupported_country|Country, region, or territory not supported/i.test(text)) {
    return proxy
      ? `${host} 拒绝了当前地区（代理 ${proxy} 的出口地区不受支持），请切换代理节点`
      : `${host} 不支持当前地区。请在 .env 中设置 HTTPS_PROXY（如 http://127.0.0.1:7890）后重启服务`;
  }
  const code = text.match(NETWORK_CODES)?.[0];
  const isNetwork = code || /fetch failed|Connection error|TimeoutError|timed out|aborted due to timeout/i.test(text);
  if (!isNetwork) return null;
  const reason = code ?? (/time/i.test(text) ? "连接超时" : "网络错误");
  return proxy
    ? `无法连接 ${host}（${reason}），请检查代理 ${proxy} 是否可用`
    : `无法连接 ${host}（${reason}）。国内网络需要在 .env 中设置 HTTPS_PROXY（如 http://127.0.0.1:7890）后重启服务`;
}

const UA = "paper-web/0.1 (personal research digest)";

export async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "user-agent": UA, ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(60_000),
      });
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status} ${url}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

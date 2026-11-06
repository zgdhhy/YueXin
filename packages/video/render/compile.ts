import { transformSync } from "esbuild";

/**
 * 编译模型写的镜头代码（ADR 0003）。论文内容不可信，代码可能被提示注入，所以先做静态检查：
 * 只能 import react / remotion / @kit，不能出现网络、存储、全局对象与动态执行相关的标识符。
 * 通过后用 esbuild 转成 CommonJS，交给浏览器里的 runtime 运行。
 */
const ALLOWED_IMPORTS = ["react", "remotion", "@kit"];

const FORBIDDEN =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval|Function|globalThis|window|self|document|navigator|localStorage|sessionStorage|indexedDB|caches|importScripts|location|process|require|Worker|postMessage|constructor|Reflect)\b|import\s*\(|__proto__/;

/** 去掉模型回复里的 ``` 代码围栏与围栏外的说明 */
export function extractCode(text: string) {
  const fenced = text.match(/```(?:tsx|jsx|typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export type CompiledShot = { js: string; error?: undefined } | { js?: undefined; error: string };

export function compileShot(source: string): CompiledShot {
  const code = extractCode(source);
  if (!code) return { error: "没有代码" };
  for (const m of code.matchAll(/^\s*import\s[\s\S]*?from\s*["']([^"']+)["']/gm)) {
    if (!ALLOWED_IMPORTS.includes(m[1])) return { error: `不允许引用 ${m[1]}` };
  }
  // 直接检查源码（不剥离字符串）：剥离步骤会被正则、模板字符串等手法绕过，宁可误判也不放过
  const bad = code.replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["'];?/gm, "").match(FORBIDDEN);
  if (bad) return { error: `不允许使用 ${bad[0].trim()}` };
  if (!/export\s+default\b/.test(code)) return { error: "缺少 export default 组件" };
  try {
    const out = transformSync(code, { loader: "tsx", format: "cjs", jsx: "automatic", target: "es2020", logLevel: "silent" });
    return { js: out.code };
  } catch (e) {
    const msg = (e as { errors?: { text: string; location?: { line: number } }[] }).errors?.[0];
    return { error: msg ? `第 ${msg.location?.line ?? "?"} 行：${msg.text}` : String(e) };
  }
}

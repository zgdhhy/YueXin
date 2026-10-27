// 开发用：登录后截取页面，用于检查 UI
// 用法：npx tsx scripts/screenshot.ts /admin /admin/models ...
// 手机尺寸：SHOT_MOBILE=1 npx tsx scripts/screenshot.ts /
// 截图前点击元素：SHOT_CLICK="css 选择器" npx tsx scripts/screenshot.ts /admin/models
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import fs from "node:fs";

process.loadEnvFile(".env");
const exe = "apps/worker/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe";
const base = process.env.SHOT_BASE ?? "http://localhost:3000";
const out = process.env.SHOT_DIR ?? "/tmp/shots";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
const mobile = !!process.env.SHOT_MOBILE;
const ctx = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
);
const cookie = await sealData({ loggedIn: true }, { password: process.env.SESSION_SECRET! });
await ctx.addCookies([{ name: "paper_session", value: cookie, url: base }]);
const page = await ctx.newPage();
for (const p of process.argv.slice(2)) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  if (process.env.SHOT_CLICK) await page.locator(process.env.SHOT_CLICK).first().click();
  const file = `${out}/${mobile ? "m" : ""}${p.replace(/[/?=&#]/g, "_") || "_root"}.png`;
  await page.screenshot({ path: file, animations: "disabled", fullPage: !process.env.SHOT_VIEWPORT });
  console.log(file);
}
await browser.close();

// Read-only UI checks against the running local web service.
// Run: node --experimental-strip-types scripts/check-layout.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";

process.loadEnvFile(".env");
const base = process.env.SHOT_BASE ?? "http://localhost:3000";
const db = new Database("data/app.db", { readonly: true });
const digest = db.prepare("SELECT id, paper_id FROM digests ORDER BY created_at DESC LIMIT 1").get() as { id: number; paper_id: string } | undefined;
const report = db.prepare("SELECT month FROM trend_reports ORDER BY month DESC LIMIT 1").get() as { month: string } | undefined;
const run = db.prepare("SELECT id FROM runs ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
db.close();
const browser = await chromium.launch({ executablePath: "apps/worker/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const ctx = await browser.newContext({ reducedMotion: "reduce" });
await ctx.addCookies([{ name: "paper_session", value: await sealData({ loggedIn: true }, { password: process.env.SESSION_SECRET! }), url: base }]);
const page = await ctx.newPage();
const failures: string[] = [];
page.on("pageerror", e => failures.push(e.message));
const routes = ["/", "/library", "/videos", "/tags", "/timeline", "/reports", "/admin", "/admin/digests", "/admin/models", "/admin/selection", "/admin/video", "/admin/schedules", "/admin/notify"];
if (digest) routes.push(`/papers/${digest.paper_id}`, `/admin/digests/${digest.id}`);
if (report) routes.push(`/reports/${report.month}`);
if (run) routes.push(`/admin/runs/${run.id}`);
const checks: { width: number; route: string; overflow: boolean }[] = [];
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, `${width}px ${route}: request failed`);
      assert.ok(await page.locator("h1").count(), `${route}: missing page heading`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) console.log(await page.evaluate(() => [...document.querySelectorAll("main *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(-8).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width }))));
      checks.push({ width, route, overflow });
      assert.equal(overflow, false, `${width}px ${route}: horizontal page overflow`);
      if (route === "/library") {
        for (const select of await page.locator(".library-options select").all()) assert.ok((await select.boundingBox())!.width >= 110, "Library filters have collapsed");
      }
    }
    console.log(`Layout checked: ${width}px, ${routes.length} pages`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/library`, { waitUntil: "networkidle" });
  await page.getByRole("searchbox").fill("__no_matching_paper__");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByRole("heading", { name: "没有找到匹配的论文" }).waitFor();
  await page.getByRole("link", { name: "查看全部解读", exact: true }).click();
  await page.locator(".library-search").waitFor();
  if (digest) {
    await page.goto(`${base}/papers/${digest.paper_id}#video`, { waitUntil: "networkidle" });
    const video = page.locator("details#video");
    if (await video.count()) assert.equal(await video.getAttribute("open"), "");
    const toc = page.getByRole("button", { name: "文章目录", exact: true });
    if (await toc.count()) {
      await toc.click();
      await page.getByRole("dialog", { name: "文章目录", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.equal(await toc.evaluate(el => el === document.activeElement), true, "Focus must return to the directory button");
    }
  }
  await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await page.getByRole("dialog", { name: "后台导航", exact: true }).waitFor();
  await page.getByRole("dialog", { name: "后台导航", exact: true }).getByRole("link", { name: "内容管理", exact: true }).click();
  await page.getByRole("heading", { name: "内容管理", exact: true }).waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0, "Navigation should close after selection");
  if (digest) {
    await page.getByRole("button", { name: "重新解读", exact: true }).first().click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "取消", exact: true }).click();
  }
  await page.goto(`${base}/admin/models`, { waitUntil: "networkidle" });
  await page.locator(".mw-stage-row.is-default").click();
  await page.locator("dialog[open]").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "Model dialog overflow");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "新建解读任务", exact: true }).click();
  assert.equal(await page.locator("#new-run").getAttribute("open"), "");
  assert.deepEqual(failures, [], "Uncaught browser errors");
  fs.mkdirSync("data/scheme-a-review", { recursive: true });
  fs.writeFileSync("data/scheme-a-review/checks.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks, interactions: ["search empty and reset", "video deep link", "directory focus and Escape", "mobile navigation", "destructive action cancelled", "model dialog and Escape", "new task disclosure"], browserErrors: failures }, null, 2));
  console.log(`Passed: ${checks.length} viewport/page combinations and read-only interactions`);
} finally { await browser.close(); }

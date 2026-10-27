import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "paper-notify-"));
const { db, schema } = await import("../db");
const { channelsFor, smtpConfig, broadcast } = await import("./notify");

test("只发给启用且订阅了该事件的渠道", async () => {
  db.insert(schema.notifyChannels)
    .values([
      { name: "全部", type: "wecom", config: { url: "https://a.invalid" } },
      { name: "只收失败", type: "feishu", config: { url: "https://b.invalid" }, events: ["failure"] },
      { name: "停用", type: "dingtalk", config: { url: "https://c.invalid" }, enabled: false },
    ])
    .run();
  assert.deepEqual(channelsFor("digest").map((c) => c.name), ["全部"]);
  assert.deepEqual(channelsFor("failure").map((c) => c.name), ["全部", "只收失败"]);

  db.delete(schema.notifyChannels).run();
  db.insert(schema.notifyChannels).values({ name: "只收月报", type: "wecom", config: { url: "https://a.invalid" }, events: ["report"] }).run();
  const logs: string[] = [];
  await broadcast("digest", { title: "t", items: [] }, (s) => logs.push(s));
  assert.match(logs[0], /没有接收「新解读」/);
});

test("邮件优先用渠道里的 SMTP，未填时回退环境变量", () => {
  delete process.env.SMTP_FROM;
  delete process.env.SMTP_PASS;
  process.env.SMTP_HOST = "smtp.env.invalid";
  process.env.SMTP_USER = "env@example.com";
  process.env.SMTP_PORT = "587";
  const fromEnv = smtpConfig({ config: { to: "me@example.com" } });
  assert.equal(fromEnv.host, "smtp.env.invalid");
  assert.equal(fromEnv.port, 587);
  assert.equal(fromEnv.secure, false);
  assert.equal(fromEnv.from, "env@example.com");

  const own = smtpConfig({ config: { to: "me@example.com", host: "smtp.qq.com", user: "bot@qq.com", pass: "code" } });
  assert.deepEqual(own, { host: "smtp.qq.com", port: 465, secure: true, user: "bot@qq.com", pass: "code", from: "bot@qq.com" });

  delete process.env.SMTP_HOST;
  assert.throws(() => smtpConfig({ config: { to: "me@example.com" } }), /未配置 SMTP/);
});

test("运行失败时推送给订阅了「运行失败」的渠道", async () => {
  const http = await import("node:http");
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      bodies.push(body);
      res.writeHead(200, { "content-type": "application/json" }).end('{"errcode":0}');
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  const policy = await import("../model-policy");
  const { executeRun } = await import("./run");
  try {
    db.delete(schema.notifyChannels).run();
    db.insert(schema.notifyChannels)
      .values([
        { name: "告警群", type: "wecom", config: { url: `http://127.0.0.1:${port}/hook` }, events: ["failure"] },
        { name: "只收解读", type: "wecom", config: { url: `http://127.0.0.1:${port}/other` }, events: ["digest"] },
      ])
      .run();
    const p = db.insert(schema.llmProviders).values({ name: "p", protocol: "openai", apiKey: "k", baseUrl: "https://p.invalid/v1" }).returning().get();
    const m = db.insert(schema.llmModels).values({ providerId: p.id, modelId: "m" }).returning().get();
    policy.saveModelPolicy({ ...policy.getModelPolicy(), confirmed: true, defaultModelId: m.id, fallbackModelId: null });
    const run = db.insert(schema.runs).values({ kind: "digest", trigger: "manual", params: { videoDigestId: 99999 } }).returning().get();
    await executeRun(run.id);
    assert.equal(db.select().from(schema.runs).all().find((r) => r.id === run.id)?.status, "failed");
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /运行失败/);
    assert.match(bodies[0], /解读不存在/);
  } finally {
    server.close();
  }
});

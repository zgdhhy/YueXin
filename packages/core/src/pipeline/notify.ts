import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { fetchWithRetry } from "../http";
import type { Log } from "./select";

export interface Notice {
  title: string;
  /** 每条一段：标题、一句话、链接 */
  items: { title: string; summary: string; url: string; extra?: string }[];
}

type Channel = typeof schema.notifyChannels.$inferSelect;
type NotifyEvent = Channel["events"][number];

function toMarkdown(n: Notice) {
  return [`## ${n.title}`, ...n.items.map((i) => `**[${i.title}](${i.url})**\n${i.summary}${i.extra ? `\n> ${i.extra}` : ""}`)].join(
    "\n\n",
  );
}

function toText(n: Notice) {
  return [n.title, ...n.items.map((i) => `【${i.title}】\n${i.summary}${i.extra ? `\n${i.extra}` : ""}\n${i.url}`)].join("\n\n");
}

function toHtml(n: Notice) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<div style="font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;max-width:640px">
<h2 style="color:#4338ca">${esc(n.title)}</h2>
${n.items
  .map(
    (i) => `<div style="margin:18px 0;padding:14px 18px;border-left:4px solid #6366f1;background:#f8fafc">
<a href="${esc(i.url)}" style="font-size:17px;font-weight:600;color:#1e293b;text-decoration:none">${esc(i.title)}</a>
<p style="color:#334155;margin:8px 0 0">${esc(i.summary)}</p>${i.extra ? `<p style="color:#64748b;font-size:13px;margin:6px 0 0">${esc(i.extra)}</p>` : ""}</div>`,
  )
  .join("\n")}
</div>`;
}

async function postJson(url: string, body: unknown) {
  const res = await fetchWithRetry(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  // 三家机器人出错时 HTTP 也是 200，需要看返回码
  const json = JSON.parse(text || "{}") as { code?: number; errcode?: number; msg?: string; errmsg?: string; StatusCode?: number };
  const code = json.code ?? json.errcode ?? json.StatusCode ?? 0;
  if (code !== 0) throw new Error(`机器人返回错误 ${code}: ${json.msg ?? json.errmsg}`);
}

async function sendFeishu(c: Channel, n: Notice) {
  const body: Record<string, unknown> = { msg_type: "text", content: { text: toText(n) } };
  if (c.config.secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    body.timestamp = timestamp;
    body.sign = crypto.createHmac("sha256", `${timestamp}\n${c.config.secret}`).update("").digest("base64");
  }
  await postJson(c.config.url, body);
}

async function sendWecom(c: Channel, n: Notice) {
  await postJson(c.config.url, { msgtype: "markdown", markdown: { content: toMarkdown(n) } });
}

async function sendDingtalk(c: Channel, n: Notice) {
  let url = c.config.url;
  if (c.config.secret) {
    const timestamp = Date.now().toString();
    const sign = crypto.createHmac("sha256", c.config.secret).update(`${timestamp}\n${c.config.secret}`).digest("base64");
    url += `${url.includes("?") ? "&" : "?"}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }
  await postJson(url, { msgtype: "markdown", markdown: { title: n.title, text: toMarkdown(n) } });
}

/** 渠道里填了 SMTP 主机就用渠道配置，否则回退到 SMTP_* 环境变量 */
export function smtpConfig(c: Pick<Channel, "config">) {
  const own = !!c.config.host;
  const pick = (k: string, envKey: string) => (own ? c.config[k] : process.env[envKey]) || undefined;
  const host = pick("host", "SMTP_HOST");
  if (!host) throw new Error("未配置 SMTP：请在渠道中填写发信服务器，或设置 SMTP_HOST 等环境变量");
  const port = Number(pick("port", "SMTP_PORT") ?? 465);
  const user = pick("user", "SMTP_USER");
  return { host, port, secure: port === 465, user, pass: pick("pass", "SMTP_PASS"), from: pick("from", "SMTP_FROM") ?? user };
}

async function sendEmail(c: Channel, n: Notice) {
  const smtp = smtpConfig(c);
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  await transport.sendMail({
    from: smtp.from,
    to: c.config.to,
    subject: n.title,
    text: toText(n),
    html: toHtml(n),
  });
}

const senders: Record<Channel["type"], (c: Channel, n: Notice) => Promise<void>> = {
  feishu: sendFeishu,
  wecom: sendWecom,
  dingtalk: sendDingtalk,
  email: sendEmail,
};

export async function sendToChannel(c: Channel, n: Notice) {
  await senders[c.type](c, n);
}

export const CHANNEL_LABELS: Record<Channel["type"], string> = { feishu: "飞书", wecom: "企业微信", dingtalk: "钉钉", email: "邮件" };

export const EVENT_LABELS: Record<NotifyEvent, string> = { digest: "新解读", report: "新月报", failure: "运行失败" };

/** 启用且订阅了该事件的渠道 */
export function channelsFor(event: NotifyEvent) {
  return db
    .select()
    .from(schema.notifyChannels)
    .where(eq(schema.notifyChannels.enabled, true))
    .all()
    .filter((c) => c.events.includes(event));
}

/** 发送到订阅该事件的渠道；单个渠道失败只记录日志 */
export async function broadcast(event: NotifyEvent, n: Notice, log: Log) {
  const channels = channelsFor(event);
  if (!channels.length) {
    log(`没有接收「${EVENT_LABELS[event]}」的通知渠道`);
    return;
  }
  let failed = 0;
  for (const c of channels) {
    try {
      await sendToChannel(c, n);
      log(`已发送：${c.name}`);
    } catch (e) {
      failed++;
      log(`发送失败 ${c.name}：${String(e)}`);
    }
  }
  if (failed === channels.length) throw new Error("所有通知渠道都发送失败");
}

export function failureNotice(r: { id: number; kind: "digest" | "trend_report"; error: string }): Notice {
  return {
    title: `运行失败 · #${r.id}`,
    items: [
      {
        title: `${r.kind === "trend_report" ? "趋势月报" : "论文解读"}运行 #${r.id} 未完成`,
        summary: r.error.slice(0, 300),
        url: `${env.siteUrl}/admin/runs/${r.id}`,
      },
    ],
  };
}

/** 定时计划到点但因配置问题没有发起运行 */
export function skippedNotice(planName: string, issue: string): Notice {
  return {
    title: `定时计划未执行 · ${planName}`,
    items: [{ title: `「${planName}」本次没有运行`, summary: issue, url: `${env.siteUrl}/admin/models` }],
  };
}

export function digestNotice(digestIds: number[]): Notice {
  const items = digestIds.map((id) => {
    const d = db.select().from(schema.digests).where(eq(schema.digests.id, id)).get()!;
    const v = db.select().from(schema.videos).where(eq(schema.videos.digestId, id)).get();
    return {
      title: d.titleZh,
      summary: d.oneLiner,
      url: `${env.siteUrl}/papers/${d.paperId}`,
      extra: [d.pickReason, v ? `含 ${Math.round(v.durationSec / 60)} 分钟讲解视频` : ""].filter(Boolean).join(" · "),
    };
  });
  return { title: `AI 前沿论文精读 · ${new Date().toLocaleDateString("zh-CN")}`, items };
}

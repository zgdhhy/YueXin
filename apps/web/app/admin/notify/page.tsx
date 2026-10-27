import Link from "next/link";
import { Bell, ChevronRight, Mail, MessageCircle, MessagesSquare, Plus, Send, type LucideIcon } from "lucide-react";
import { db, schema, CHANNEL_LABELS, EVENT_LABELS, NOTIFY_EVENTS } from "@paper/core";
import { deleteChannel, saveChannel, testChannel } from "../actions";
import { SubmitButton } from "@/components/admin-client";
import { Modal } from "@/components/modal";
import { Card, EmptyState, Field, Input, PageHeader, StatusBadge, Switch, buttonCls } from "@/components/ui";

type Channel = typeof schema.notifyChannels.$inferSelect;
type ChannelType = Channel["type"];

const TYPES: Record<ChannelType, { icon: LucideIcon; tone: string; doc?: string }> = {
  feishu: { icon: Send, tone: "bg-sky-50 text-sky-600", doc: "https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot" },
  wecom: { icon: MessagesSquare, tone: "bg-emerald-50 text-emerald-600", doc: "https://developer.work.weixin.qq.com/document/path/91770" },
  dingtalk: { icon: MessageCircle, tone: "bg-blue-50 text-blue-600", doc: "https://open.dingtalk.com/document/robots/custom-robot-access" },
  email: { icon: Mail, tone: "bg-amber-50 text-amber-600" },
};
const TYPE_ORDER: ChannelType[] = ["feishu", "wecom", "dingtalk", "email"];

function TypeIcon({ type }: { type: ChannelType }) {
  const { icon: Icon, tone } = TYPES[type];
  return (
    <span className={`rounded-lg p-2 ${tone}`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

function DocLink({ type }: { type: ChannelType }) {
  const doc = TYPES[type].doc;
  return doc ? (
    <a href={doc} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
      如何获取
    </a>
  ) : null;
}

/** 密钥类字段不回显，留空沿用已保存的值 */
const kept = (c: Channel | undefined, k: string) => (c?.config[k] ? "已设置，留空不修改" : undefined);

function TypePicker() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TYPE_ORDER.map((t) => (
        <Link
          key={t}
          href={`/admin/notify?modal=new&type=${t}`}
          scroll={false}
          className="flex items-center gap-3 rounded-lg p-4 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-indigo-300"
        >
          <TypeIcon type={t} />
          <span className="font-medium text-slate-900">{CHANNEL_LABELS[t]}</span>
        </Link>
      ))}
    </div>
  );
}

function ChannelForm({ type, c }: { type: ChannelType; c?: Channel }) {
  const smtpOwn = !!c?.config.host || !process.env.SMTP_HOST;
  return (
    <form action={saveChannel} className="flex min-h-full flex-col">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="type" value={type} />
      <div className="flex-1 space-y-5 pb-6">
        <Field label="名称">
          <Input name="name" defaultValue={c?.name} placeholder={type === "email" ? "我的邮箱" : `${CHANNEL_LABELS[type]}群`} />
        </Field>
        {type === "email" ? (
          <>
            <Field label="收件邮箱" hint="多个用逗号分隔">
              <Input name="to" type="text" inputMode="email" defaultValue={c?.config.to} required />
            </Field>
            <details open={smtpOwn} className="rounded-lg ring-1 ring-slate-200">
              <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-slate-700">
                发信服务器（SMTP）
                {process.env.SMTP_HOST && <span className="ml-2 font-normal text-slate-500">不填则使用服务器环境变量</span>}
              </summary>
              <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
                <Field label="服务器">
                  <Input name="host" defaultValue={c?.config.host} placeholder="smtp.qq.com" />
                </Field>
                <Field label="端口">
                  <Input name="port" type="number" defaultValue={c?.config.port} placeholder="465" />
                </Field>
                <Field label="账号">
                  <Input name="user" defaultValue={c?.config.user} autoComplete="off" />
                </Field>
                <Field label="密码 / 授权码">
                  <Input name="pass" type="password" placeholder={kept(c, "pass")} autoComplete="new-password" />
                </Field>
                <Field label="发件人" className="sm:col-span-2">
                  <Input name="from" defaultValue={c?.config.from} placeholder="论文精读 <bot@example.com>" />
                </Field>
              </div>
            </details>
          </>
        ) : (
          <>
            <Field label="Webhook 地址" hint={<DocLink type={type} />}>
              <Input name="url" type="url" defaultValue={c?.config.url} required />
            </Field>
            {type !== "wecom" && (
              <Field label="加签密钥（可选）">
                <Input name="secret" type="password" placeholder={kept(c, "secret")} autoComplete="new-password" />
              </Field>
            )}
          </>
        )}
        <fieldset>
          <legend className="text-[13px] font-medium text-slate-700">接收</legend>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
            {NOTIFY_EVENTS.map((e) => (
              <label key={e} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="events" value={e} defaultChecked={c ? c.events.includes(e) : true} className="h-4 w-4 accent-indigo-600" />
                {EVENT_LABELS[e]}
              </label>
            ))}
          </div>
        </fieldset>
        <Switch name="enabled" label="启用" defaultChecked={c?.enabled ?? true} />
      </div>
      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-6 py-4">
        {c && (
          <SubmitButton variant="danger" size="sm" formAction={deleteChannel} formNoValidate confirm={`确定删除渠道「${c.name}」？`}>
            删除
          </SubmitButton>
        )}
        <div className="ml-auto flex gap-2">
          <SubmitButton variant="secondary" formAction={testChannel} pendingText="发送中…">
            <Send className="h-3.5 w-3.5" />
            保存并测试
          </SubmitButton>
          <SubmitButton pendingText="保存中…">保存</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function ChannelModal({ params, channels }: { params: Record<string, string | string[] | undefined>; channels: Channel[] }) {
  if (params.modal === "edit") {
    const c = channels.find((x) => x.id === Number(params.id));
    if (!c) return null;
    return (
      <Modal title={c.name} description={CHANNEL_LABELS[c.type]} closeHref="/admin/notify" size="drawer">
        <ChannelForm type={c.type} c={c} />
      </Modal>
    );
  }
  if (params.modal !== "new") return null;
  const type = TYPE_ORDER.find((t) => t === params.type);
  return (
    <Modal title={type ? `添加${CHANNEL_LABELS[type]}渠道` : "添加渠道"} closeHref="/admin/notify" size="drawer">
      {type ? <ChannelForm type={type} /> : <TypePicker />}
    </Modal>
  );
}

export default async function NotifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const channels = db.select().from(schema.notifyChannels).all();
  const add = (
    <Link href="/admin/notify?modal=new" scroll={false} className={buttonCls()}>
      <Plus className="h-4 w-4" />
      添加渠道
    </Link>
  );
  return (
    <>
      <PageHeader title="通知" actions={channels.length ? add : undefined} />
      <Card padded={false}>
        {channels.length ? (
          <ul className="divide-y divide-slate-100">
            {channels.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/notify?modal=edit&id=${c.id}`} scroll={false} className="flex items-center gap-4 px-4 py-4 transition hover:bg-slate-50 sm:px-6">
                  <TypeIcon type={c.type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{c.name}</div>
                    <div className="mt-0.5 text-[13px] text-slate-500">{c.events.map((e) => EVENT_LABELS[e]).join(" · ")}</div>
                  </div>
                  {!c.enabled && <StatusBadge status="disabled" />}
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Bell} title="还没有通知渠道">
            <div className="mt-3">{add}</div>
          </EmptyState>
        )}
      </Card>
      <ChannelModal key={`${params.modal}-${params.id}-${params.type}`} params={params} channels={channels} />
    </>
  );
}

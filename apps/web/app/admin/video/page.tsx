import fs from "node:fs";
import Link from "next/link";
import { Music, Music2, Plus, Upload, Wand2 } from "lucide-react";
import { db, schema, dataPath, getSetting, listStyles, getStyle, narrationProviders, defaultStyle, type VideoStyle } from "@paper/core";
import {
  copyStyleAction,
  deleteMusic,
  deleteStyleAction,
  makeSampleAction,
  previewMusic,
  saveStyleAction,
  saveVideoSettings,
  toggleStyleAction,
  uploadMusic,
} from "../actions";
import { SubmitButton } from "@/components/admin/admin-client";
import { Modal } from "@/components/admin/modal";
import { Card, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Switch, Tag, Textarea, buttonCls } from "@/components/admin/ui";
import { FONT_KEYS, FONT_NAMES, fontKey } from "@/lib/fonts";
import { fileUrl } from "@/lib/data";
import { ReferenceUpload } from "./reference-upload";

type Params = Record<string, string | string[] | undefined>;

const MODES = [
  ["procedural", "程序化合成"],
  ["library", "从曲库选取"],
  ["none", "无音乐"],
] as const;
const COLOR_FIELDS = [
  ["bg", "背景"],
  ["bg2", "背景渐变"],
  ["surface", "卡片"],
  ["border", "边框"],
  ["text", "文字"],
  ["muted", "次要文字"],
  ["primary", "主色"],
  ["accent", "强调色"],
] as const;
const BACKGROUNDS = [["aurora", "光斑"], ["grid", "网格"], ["plain", "纯色"], ["paper", "纸面"]] as const;
const TRANSITIONS = [["fade", "淡入淡出"], ["slide", "滑动"], ["cut", "硬切"]] as const;

function Swatches({ s }: { s: VideoStyle }) {
  const c = s.tokens.colors;
  return (
    <div className="flex h-16 overflow-hidden rounded-md ring-1 ring-slate-200" style={{ background: `linear-gradient(135deg, ${c.bg}, ${c.bg2})` }}>
      <div className="flex flex-1 items-center gap-2 px-4" style={{ color: c.text, fontFamily: s.tokens.fonts.heading }}>
        <span className="text-lg font-bold">Aa 讲解</span>
      </div>
      {[c.primary, c.accent].map((x, i) => <span key={i} className="w-8" style={{ background: x }} />)}
    </div>
  );
}

function StyleForm({ s }: { s?: VideoStyle }) {
  const t = s?.tokens ?? defaultStyle().tokens;
  return (
    <form action={saveStyleAction} className="flex min-h-full flex-col">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="flex-1 space-y-5 pb-6">
        <Field label="名称"><Input name="name" defaultValue={s?.name} required maxLength={30} /></Field>
        <Field label="适合什么样的论文"><Input name="description" defaultValue={s?.description} maxLength={200} /></Field>
        <Field label="风格说明" hint="交给写脚本和写代码的大模型：风格、画面、节奏、禁忌">
          <Textarea name="guide" defaultValue={s?.guide} rows={9} />
        </Field>
        <fieldset>
          <legend className="text-[13px] font-medium text-slate-700">配色</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {COLOR_FIELDS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[13px] text-slate-600">
                <span className="h-7 w-7 shrink-0 rounded ring-1 ring-slate-200" style={{ background: t.colors[k] }} />
                <span className="w-16 shrink-0">{label}</span>
                <Input name={`color_${k}`} defaultValue={t.colors[k]} className="font-mono text-xs" aria-label={label} />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="标题字体"><Select name="fontHeading" defaultValue={fontKey(t.fonts.heading)}>{FONT_KEYS.map((k) => <option key={k} value={k}>{FONT_NAMES[k]}</option>)}</Select></Field>
          <Field label="正文字体"><Select name="fontBody" defaultValue={fontKey(t.fonts.body)}>{FONT_KEYS.map((k) => <option key={k} value={k}>{FONT_NAMES[k]}</option>)}</Select></Field>
          <Field label="背景"><Select name="background" defaultValue={t.background}>{BACKGROUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="转场"><Select name="transition" defaultValue={t.transition}>{TRANSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="字幕底色"><Select name="subtitle" defaultValue={t.subtitle}><option value="dark">深色</option><option value="light">浅色</option></Select></Field>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-6 py-4">
        {s && !s.slug && (
          <SubmitButton variant="danger" size="sm" formAction={deleteStyleAction} formNoValidate confirm={`删除风格「${s.name}」？`}>删除</SubmitButton>
        )}
        {s && <SubmitButton variant="ghost" size="sm" formAction={copyStyleAction} formNoValidate>复制为新风格</SubmitButton>}
        <SubmitButton className="ml-auto" pendingText="保存中…">保存</SubmitButton>
      </div>
    </form>
  );
}

/** 样片地址（带修改时间防缓存）；文件不存在时为空 */
const sampleOf = (s: VideoStyle) => (s.samplePath && fs.existsSync(dataPath(s.samplePath)) ? `${fileUrl(s.samplePath)}?t=${fs.statSync(dataPath(s.samplePath)).mtimeMs}` : null);

function StyleLibrary({ params }: { params: Params }) {
  const styles = listStyles();
  const video = getSetting("video");
  const fixedId = video.styleMode === "fixed" ? video.styleId : null;
  const editing = params.style === "new" ? "new" : getStyle(Number(params.style));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-end gap-3">
        <ReferenceUpload />
        <Link href="/admin/video?style=new" scroll={false} className={buttonCls("secondary", "sm")}><Plus className="h-3.5 w-3.5" />新建风格</Link>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {styles.map((s) => (
          <Card key={s.id} padded={false}>
            <div className="space-y-3 p-4 sm:p-5">
              <Swatches s={s} />
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/video?style=${s.id}`} scroll={false} className="font-medium text-slate-900 hover:text-indigo-700">{s.name}</Link>
                {fixedId === s.id && <Tag tone="indigo">固定使用</Tag>}
                {!s.enabled && <StatusBadge status="disabled" />}
              </div>
              <p className="text-[13px] text-slate-500">{s.description}</p>
              {sampleOf(s) && <video controls preload="none" src={sampleOf(s)!} className="aspect-video w-full rounded-md bg-slate-900" />}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <form action={makeSampleAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton variant="secondary" size="sm" pendingText="提交中…" confirm="生成约 20 秒样片：会调用 3 次「动画代码」模型并在 worker 中渲染。">
                    <Wand2 className="h-3.5 w-3.5" />{sampleOf(s) ? "重新生成样片" : "生成样片"}
                  </SubmitButton>
                </form>
                <form action={toggleStyleAction} className="ml-auto">
                  <input type="hidden" name="id" value={s.id} />
                  {!s.enabled && <input type="hidden" name="enabled" value="on" />}
                  <SubmitButton variant="ghost" size="sm">{s.enabled ? "停用" : "启用"}</SubmitButton>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {editing && (
        <Modal key={String(params.style)} title={editing === "new" ? "新建风格" : editing.name} closeHref="/admin/video" size="drawer">
          <StyleForm s={editing === "new" ? undefined : editing} />
        </Modal>
      )}
    </>
  );
}

function Settings() {
  const video = getSetting("video");
  const styles = listStyles().filter((s) => s.enabled);
  const providers = narrationProviders();
  const tracks = db.select().from(schema.musicTracks).all();
  const hasPreview = fs.existsSync(dataPath("music", "preview.wav"));
  const previewAt = hasPreview ? fs.statSync(dataPath("music", "preview.wav")).mtimeMs : 0;
  return (
    <>
      <Card title="生成设置" className="mb-6">
        <form action={saveVideoSettings} className="space-y-6">
          <Switch name="enabled" label="解读完成后自动生成讲解视频" defaultChecked={video.enabled} />
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-slate-700">风格</legend>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="styleMode" value="auto" defaultChecked={video.styleMode === "auto"} className="accent-indigo-600" />写脚本时按论文自动挑选</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="styleMode" value="fixed" defaultChecked={video.styleMode === "fixed"} className="accent-indigo-600" />固定使用</label>
              <div className="w-48"><Select name="styleId" defaultValue={String(video.styleId ?? styles[0]?.id ?? "")}>{styles.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</Select></div>
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <Switch name="narration" label="旁白" hint="用服务商的语音合成朗读中文字幕，镜头时长跟随语音" defaultChecked={video.narration.enabled} />
            {providers.length ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="服务商"><Select name="narrationProvider" defaultValue={String(video.narration.providerId ?? providers[0].id)}>{providers.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</Select></Field>
                <Field label="语音模型"><Input name="narrationModel" defaultValue={video.narration.model} placeholder="tts-1" /></Field>
                <Field label="音色"><Input name="narrationVoice" defaultValue={video.narration.voice} placeholder="alloy" /></Field>
                <Field label="语速"><Input type="number" name="narrationSpeed" min={0.5} max={2} step={0.1} defaultValue={video.narration.speed} /></Field>
              </div>
            ) : (
              <p className="text-[13px] text-slate-500">需要先在模型页添加 OpenAI 兼容的服务商。</p>
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-slate-700">背景音乐</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              {MODES.map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-2"><input type="radio" name="musicMode" value={value} defaultChecked={video.musicMode === value} className="accent-indigo-600" />{label}</label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2 lg:w-2/3">
            <Field label="音乐音量（%）"><Input type="number" name="musicVolume" min={0} max={100} defaultValue={Math.round(video.musicVolume * 100)} /></Field>
            <Field label="无旁白时的字幕阅读速度（字/秒）"><Input type="number" name="readingSpeed" min={2} max={12} step={0.5} defaultValue={video.readingSpeed} /></Field>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-5">
            <SubmitButton pendingText="保存中…">保存</SubmitButton>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="合成音乐试听" className="lg:col-span-2">
          <div className="space-y-4">
            <form action={previewMusic}>
              <SubmitButton variant="secondary" pendingText="合成中…"><Wand2 className="h-4 w-4" />生成一段试听</SubmitButton>
            </form>
            {hasPreview && <audio controls src={`/files/music/preview.wav?t=${previewAt}`} className="w-full" />}
          </div>
        </Card>
        <Card title={`曲库 · ${tracks.length} 首`} className="lg:col-span-3" padded={false}>
          <form action={uploadMusic} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <input type="file" name="files" accept=".mp3,.wav,.m4a,.ogg" multiple className="flex-1 text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200" />
            <SubmitButton size="sm" pendingText="上传中…"><Upload className="h-3.5 w-3.5" />上传</SubmitButton>
          </form>
          {tracks.length ? (
            <ul className="divide-y divide-slate-100">
              {tracks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
                  <Music2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 sm:w-40 sm:flex-none">{t.name}</span>
                  <audio controls preload="none" src={`/files/${t.path}`} className="order-last h-8 w-full sm:order-none sm:w-auto sm:flex-1" />
                  <form action={deleteMusic}>
                    <input type="hidden" name="id" value={t.id} />
                    <SubmitButton variant="danger" size="sm" confirm={`确定删除「${t.name}」？`}>删除</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Music} title="曲库为空">支持 mp3 / wav / m4a / ogg</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}

export default async function VideoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab = params.tab === "settings" ? "settings" : "styles";
  return (
    <>
      <PageHeader title="视频" />
      <nav className="admin-tabs" aria-label="视频设置">
        <Link href="/admin/video" aria-current={tab === "styles" ? "page" : undefined}>风格库</Link>
        <Link href="/admin/video?tab=settings" aria-current={tab === "settings" ? "page" : undefined}>生成设置</Link>
      </nav>
      {tab === "styles" ? <StyleLibrary params={params} /> : <Settings />}
    </>
  );
}

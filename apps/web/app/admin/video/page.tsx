import fs from "node:fs";
import { Music, Music2, Upload, Wand2 } from "lucide-react";
import { db, schema, dataPath, getSetting } from "@paper/core";
import { deleteMusic, previewMusic, saveVideoSettings, uploadMusic } from "../actions";
import { SubmitButton } from "@/components/admin-client";
import { Card, EmptyState, Field, Input, PageHeader, Switch } from "@/components/ui";

const MODES = [
  ["procedural", "程序化合成", "每个视频自动合成不同调性、速度的轻音乐"],
  ["library", "从曲库选取", "按视频轮换使用下方上传的音乐"],
  ["none", "无音乐", "只有画面和字幕"],
] as const;

export default function VideoPage() {
  const video = getSetting("video");
  const tracks = db.select().from(schema.musicTracks).all();
  const hasPreview = fs.existsSync(dataPath("music", "preview.wav"));
  const previewAt = hasPreview ? fs.statSync(dataPath("music", "preview.wav")).mtimeMs : 0;
  return (
    <>
      <PageHeader title="视频" description="解读完成后，大模型把它改写成分镜，再用 Remotion 渲染成 16:9 横屏视频，配中英双语字幕，不含配音。" />

      <Card title="生成设置" className="mb-6">
        <form action={saveVideoSettings} className="space-y-6">
          <Switch name="enabled" label="解读完成后自动生成讲解视频" hint="关闭后仍可在「解读管理」中手动重做视频" defaultChecked={video.enabled} />
          <div>
            <div className="mb-2 text-[13px] font-medium text-slate-700">背景音乐</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {MODES.map(([value, label, hint]) => (
                <label
                  key={value}
                  className="relative flex cursor-pointer flex-col rounded-xl p-4 ring-1 ring-slate-200 transition hover:ring-slate-300 has-[:checked]:bg-indigo-50/50 has-[:checked]:ring-2 has-[:checked]:ring-indigo-500"
                >
                  <input type="radio" name="musicMode" value={value} defaultChecked={video.musicMode === value} className="sr-only" />
                  <span className="text-sm font-medium text-slate-900">{label}</span>
                  <span className="mt-1 text-xs text-slate-500">{hint}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:w-2/3">
            <Field label="音乐音量（%）">
              <Input type="number" name="musicVolume" min={0} max={100} defaultValue={Math.round(video.musicVolume * 100)} />
            </Field>
            <Field label="字幕阅读速度（字/秒）" hint="数值越小，视频越长、节奏越慢">
              <Input type="number" name="readingSpeed" min={2} max={12} step={0.5} defaultValue={video.readingSpeed} />
            </Field>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-5">
            <SubmitButton pendingText="保存中…">保存设置</SubmitButton>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="合成音乐试听" description="每次随机一个种子，生成 30 秒" className="lg:col-span-2">
          <div className="space-y-4">
            <form action={previewMusic}>
              <SubmitButton variant="secondary" pendingText="合成中…">
                <Wand2 className="h-4 w-4" />
                生成一段试听
              </SubmitButton>
            </form>
            {hasPreview && <audio controls src={`/files/music/preview.wav?t=${previewAt}`} className="w-full" />}
          </div>
        </Card>

        <Card title={`曲库 · ${tracks.length} 首`} description="曲库为空时自动改用程序化合成；音乐会循环并在结尾淡出" className="lg:col-span-3" padded={false}>
          <form action={uploadMusic} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <input
              type="file"
              name="files"
              accept=".mp3,.wav,.m4a,.ogg"
              multiple
              className="flex-1 text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <SubmitButton size="sm" pendingText="上传中…">
              <Upload className="h-3.5 w-3.5" />
              上传
            </SubmitButton>
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
                    <SubmitButton variant="danger" size="sm" confirm={`确定删除「${t.name}」？`}>
                      删除
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Music} title="曲库为空">
              支持 mp3 / wav / m4a / ogg
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlayCircle, X } from "@/components/reading-icons";
import { useNotebookAutosave } from "./use-notebook-autosave";
import { cn } from "@/lib/cn";
import { PaperImage } from "../site/paper-image";
import { NotebookEditor } from "./notebook-editor";
export function ReaderNotebook({ subjectId, initialContent, highlights }: { subjectId: string; initialContent: string; highlights?: ReactNode }) {
    const { value, onChange, status, error } = useNotebookAutosave(subjectId, initialContent);
    return <div className="reader-notebook" data-subject-id={subjectId} data-save-state={status}>
      <div className="notebook-writing-surface">
        <NotebookEditor value={value} onChange={onChange} disabled={false}/>
        <div className="notebook-save-status" role="status" aria-live="polite">{status === "saved" ? "已保存" : status === "error" ? "保存失败" : "正在保存…"}</div>
      </div>
      {error && <p role="alert" className="reader-chat-error">{error}，正在重试</p>}
      {highlights}
    </div>;
}
export type VideoItem = {
    paperId: string;
    titleZh: string;
    cover: string | null;
    src: string;
    duration: string;
};
/** 视频页：网格卡片，点开在弹层播放 */
export function VideoGallery({ items }: {
    items: VideoItem[];
}) {
    const [current, setCurrent] = useState<VideoItem | null>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (current)
            dialog.current?.showModal();
    }, [current]);
    const close = () => {
        dialog.current?.close();
        setCurrent(null);
    };
    return (<>
      <div className="video-grid">
        {items.map((v) => (<button key={v.paperId} type="button" className="video-card" onClick={() => setCurrent(v)}>
            <span className="video-thumb">
              {v.cover ? <PaperImage src={v.cover} title={v.titleZh}/> : <span className="video-thumb-empty"/>}
              <span className="video-duration">
        <PlayCircle size={14}/>{v.duration}</span>
            </span>
            <span className="video-title">{v.titleZh}</span>
          </button>))}
      </div>
      {current && (<dialog ref={dialog} className="video-dialog" aria-label={current.titleZh} onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => e.target === dialog.current && close()}>
          <div className="video-dialog-head">
            <Link href={`/papers/${current.paperId}`}>{current.titleZh}</Link>
            <button type="button" aria-label="关闭" onClick={close}>
        <X size={20}/>
        </button>
          </div>
          <video src={current.src} controls autoPlay className={cn("video-player")}/>
        </dialog>)}
    </>);
}

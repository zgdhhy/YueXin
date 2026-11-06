"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2 } from "lucide-react";
import { buttonCls } from "@/components/admin/ui";

/** 上传参考视频：直接把文件作为请求体发给接口，成功后跳到这次运行的进度页 */
export function ReferenceUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const upload = async (file: File) => {
    setError("");
    if (file.size > 200 * 1024 * 1024) return setError("视频超过 200MB，请截取一段再上传");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/style-reference", { method: "POST", headers: { "content-type": file.type || "video/mp4" }, body: file });
      const data = (await res.json()) as { runId?: number; error?: string };
      if (!res.ok || !data.runId) throw new Error(data.error ?? `上传失败（HTTP ${res.status}）`);
      router.push(`/admin/runs/${data.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
        className="sr-only"
        aria-label="选择参考视频"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <button type="button" className={buttonCls("secondary", "sm")} disabled={busy} onClick={() => input.current?.click()} title="不超过 10 分钟、200MB；分析后原视频即删除">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
        {busy ? "上传中…" : "从参考视频生成"}
      </button>
      {error && <span role="alert" className="text-[13px] text-red-600">{error}</span>}
    </span>
  );
}

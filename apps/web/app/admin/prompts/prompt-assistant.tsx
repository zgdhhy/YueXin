"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { Message } from "@paper/core";
import { ChatThread, Drawer } from "@/components/chat";
import { buttonCls } from "@/components/admin/ui";
import { lineDiff } from "@/lib/diff";
import { isRequirementDraft } from "@/lib/drafts";
import { askPromptAction, newPromptChatAction, saveRequirementDraftAction } from "../actions";

/** 只显示改动处及上下各一行，其余折叠 */
function Diff({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after);
  const near = (i: number) => lines.slice(Math.max(0, i - 1), i + 2).some((l) => l.type !== "same");
  let skipped = false;
  return (
    <pre className="prompt-diff">
      {lines.map((l, i) => {
        if (l.type === "same" && !near(i)) {
          if (skipped) return null;
          skipped = true;
          return <span key={i} className="is-skip">⋯</span>;
        }
        skipped = false;
        return <span key={i} className={l.type === "add" ? "is-add" : l.type === "del" ? "is-del" : ""}>{l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}{l.text || " "}</span>;
      })}
    </pre>
  );
}

/** 提示词助手：说出不满意的地方 → 助手给出修改后的写作要求（差异视图）→ 保存为新版本，再试写或启用 */
export function PromptAssistant({ stage, stageName, versionId, versionNumber, versions, conversationId: initialId, initial }: {
  stage: string;
  stageName: string;
  versionId: number;
  versionNumber: number;
  /** 版本 id → 内容，用于对比草稿的基础版本 */
  versions: Record<number, { number: number; content: string }>;
  conversationId: number | null;
  initial: Message[];
}) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initial);
  const [saved, setSaved] = useState<Record<number, number>>({});
  const [error, setError] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button type="button" className={buttonCls()} onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        提示词助手
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`提示词助手 · ${stageName}`}
        actions={
          messages.length > 0 && (
            <button type="button" className={buttonCls("ghost", "sm")} disabled={pending} onClick={() => start(async () => { setConversationId(await newPromptChatAction(stage)); setMessages([]); })}>
              <Plus className="h-3.5 w-3.5" />新对话
            </button>
          )
        }
      >
        <ChatThread
          messages={messages}
          onMessages={setMessages}
          send={async (text) => {
            const r = await askPromptAction(stage, versionId, text, conversationId ?? undefined);
            if (r.conversationId) setConversationId(r.conversationId);
            return r;
          }}
          placeholder={`说说 v${versionNumber} 的产出哪里不满意`}
          empty={<>例如：「解读太长了，实验部分写得太简略」或「视频镜头太像幻灯片」。助手会参考最近的产出和你的收藏 / 不感兴趣。</>}
          renderAssistant={(m) => {
            const draft = isRequirementDraft(m.data) ? m.data : null;
            const base = draft ? versions[draft.baseVersionId] : undefined;
            // 已经保存过（内容相同的版本存在）就直接链接过去
            const existing = draft ? Object.entries(versions).find(([, v]) => v.content.trim() === draft.content.trim()) : undefined;
            const savedId = saved[m.id] ?? (existing ? Number(existing[0]) : undefined);
            return (
              <>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {draft && (
                  <div className="topic-draft">
                    <div className="text-[13px] text-slate-500">以 v{base?.number ?? "?"} 为基础 · {draft.note}</div>
                    {base ? <Diff before={base.content} after={draft.content} /> : <pre className="prompt-diff">{draft.content}</pre>}
                    <button
                      type="button"
                      className={buttonCls(savedId ? "secondary" : "primary", "sm")}
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          if (savedId) return router.push(`/admin/prompts?stage=${stage}&v=${savedId}`);
                          const r = await saveRequirementDraftAction(m.id);
                          if (r.id) {
                            setSaved((s) => ({ ...s, [m.id]: r.id! }));
                            setOpen(false);
                            router.push(`/admin/prompts?stage=${stage}&v=${r.id}`);
                          } else setError((x) => ({ ...x, [m.id]: r.error ?? "保存失败" }));
                        })
                      }
                    >
                      {savedId ? `查看 v${versions[savedId]?.number ?? ""}` : "保存为新版本"}
                    </button>
                    {error[m.id] && <p role="alert" className="text-[13px] text-red-600">{error[m.id]}</p>}
                  </div>
                )}
              </>
            );
          }}
        />
      </Drawer>
    </>
  );
}

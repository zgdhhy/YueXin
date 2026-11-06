"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { TopicReply } from "@paper/core";
import { isTopicDraft } from "@/lib/drafts";
import { ChatThread, Drawer } from "@/components/chat";
import { buttonCls, Tag } from "@/components/admin/ui";
import { askTopicAction, newTopicChatAction, saveTopicDraftAction } from "../actions";

/** 方向助手：大白话描述兴趣 → 草稿 → 看近期会命中哪些论文 → 保存为方向 */
export function TopicAssistant({ conversationId: initialId, initial, topicNames }: { conversationId: number | null; initial: TopicReply[]; topicNames: string[] }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initial);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button type="button" className={buttonCls()} onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        方向助手
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="方向助手"
        actions={
          messages.length > 0 && (
            <button
              type="button"
              className={buttonCls("ghost", "sm")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setConversationId(await newTopicChatAction());
                  setMessages([]);
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />新对话
            </button>
          )
        }
      >
        <ChatThread
          messages={messages}
          onMessages={setMessages}
          send={async (text) => {
            const r = await askTopicAction(text, conversationId ?? undefined);
            if (r.conversationId) setConversationId(r.conversationId);
            return r;
          }}
          placeholder="说说你想看什么样的论文"
          empty={<>例如：「想看让小模型也能做好推理的工作」或「最近该调整哪些方向？」</>}
          renderAssistant={(m) => {
            const draft = isTopicDraft(m.data) ? m.data : null;
            return (
            <>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {draft && (
                <div className="topic-draft">
                  <div className="flex items-baseline gap-2">
                    <strong>{draft.name}</strong>
                    <span className="text-xs text-slate-500">权重 {draft.weight}</span>
                  </div>
                  <p>{draft.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {draft.arxivCategories.map((c) => <Tag key={c} tone="indigo">{c}</Tag>)}
                    {draft.keywords.map((k) => <Tag key={k}>{k}</Tag>)}
                  </div>
                  {m.matches && (
                    <div className="topic-draft-matches">
                      <div>近期论文中命中 {m.matches.total} 篇</div>
                      {m.matches.top.length > 0 && <ul>{m.matches.top.map((p) => <li key={p.paperId}>{p.title}{p.digested && <span>已解读</span>}</li>)}</ul>}
                    </div>
                  )}
                  <button
                    type="button"
                    className={buttonCls(saved[m.id] ? "secondary" : "primary", "sm")}
                    disabled={!!saved[m.id] || pending}
                    onClick={() =>
                      start(async () => {
                        const r = await saveTopicDraftAction(m.id);
                        setSaved((s) => ({ ...s, [m.id]: r.ok ?? r.error ?? "" }));
                        router.refresh();
                      })
                    }
                  >
                    {saved[m.id] ?? (topicNames.includes(draft.name) ? `更新「${draft.name}」` : "保存为方向")}
                  </button>
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

/** 新论文与近期重要论文的名额比例 */
export function RatioField({ defaultValue }: { defaultValue: number }) {
  const [v, setV] = useState(defaultValue);
  return (
    <label className="block space-y-2">
      <span className="flex justify-between text-[13px] text-slate-600">
        <span>新论文 {100 - v}%</span>
        <span>近期重要论文 {v}%</span>
      </span>
      <input type="range" name="notableRatio" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} className="w-full accent-[var(--ds-accent)]" aria-label="近期重要论文占比" />
    </label>
  );
}

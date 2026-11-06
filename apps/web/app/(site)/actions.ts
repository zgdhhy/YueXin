"use server";

import { revalidatePath } from "next/cache";
import { getReadingDocument, saveAnswerAsNote, saveWholeNote } from "@paper/core";
import { requireAuth } from "@/lib/auth";
import { listReadingHighlights, addReadingHighlight, updateReadingHighlight, removeReadingHighlight, type HighlightAnchor } from "@paper/core";
import { listPaperConversations, getPaperConversation, newPaperConversation, renamePaperConversation, deletePaperConversation } from "@paper/core";
import { db, schema } from "@paper/core/db";
import { and, eq } from "drizzle-orm";
import { guessProviderIcon, iconAsset, isLlmIcon } from "@paper/core/icons";
import { resolvedStage } from "@paper/core";

/** Reading subjects are a published paper ID or report:YYYY-MM. Authentication precedes lookup. */
async function guard(paperId: string) {
  await requireAuth();
  if (!getReadingDocument(paperId)) throw new Error("解读不存在");
}

const refresh = () => revalidatePath("/", "layout");

export async function readingHighlightsAction(subjectId: string) {
  await guard(subjectId);
  return listReadingHighlights(subjectId);
}

export async function addHighlightAction(subjectId: string, anchor: HighlightAnchor, options?: { color?: string; comment?: string }) {
  await guard(subjectId);
  const item = addReadingHighlight(subjectId, anchor, options);
  refresh();
  return item;
}

export async function updateHighlightAction(subjectId: string, id: number, comment: string, options?: { color?: string; anchor?: HighlightAnchor }) {
  await guard(subjectId);
  return updateReadingHighlight(subjectId, id, comment, options);
}

export async function removeHighlightAction(subjectId: string, id: number) {
  await guard(subjectId);
  removeReadingHighlight(subjectId, id);
  refresh();
}

export async function saveNoteAction(paperId: string, content: string) {
  await guard(paperId);
  if (content.length > 20000) throw new Error("笔记不能超过 20000 字符");
  saveWholeNote(paperId, content);
  refresh();
}


export async function readingModelsAction(subjectId: string) {
  await guard(subjectId);
  const defaultId = resolvedStage("chat").primaryId;
  return db.select({ id: schema.llmModels.id, name: schema.llmModels.displayName, model: schema.llmModels.modelId, provider: schema.llmProviders.name, icon: schema.llmProviders.icon, baseUrl: schema.llmProviders.baseUrl })
    .from(schema.llmModels).innerJoin(schema.llmProviders, eq(schema.llmModels.providerId, schema.llmProviders.id))
    .where(and(eq(schema.llmModels.enabled, true), eq(schema.llmProviders.enabled, true))).all().map(({ icon, baseUrl, ...model }) => {
      const id = isLlmIcon(icon) ? icon : guessProviderIcon({ name: model.provider, baseUrl });
      return { ...model, icon: id ? iconAsset(id) : null, isDefault: model.id === defaultId };
    });
}

export async function paperChatsAction(paperId: string) {
  await guard(paperId);
  return listPaperConversations(paperId);
}
export async function paperChatAction(paperId: string, id: number) {
  await guard(paperId);
  return getPaperConversation(paperId, id);
}
export async function newPaperChatAction(paperId: string) {
  await guard(paperId);
  return newPaperConversation(paperId);
}
export async function renamePaperChatAction(paperId: string, id: number, title: string) {
  await guard(paperId);
  renamePaperConversation(paperId, id, title);
  return listPaperConversations(paperId);
}
export async function deletePaperChatAction(paperId: string, id: number) {
  await guard(paperId);
  deletePaperConversation(paperId, id);
  return listPaperConversations(paperId);
}

/** 把一条回答追加到整篇笔记，返回笔记全文 */
export async function saveAnswerNoteAction(paperId: string, messageId: number) {
  await guard(paperId);
  const note = saveAnswerAsNote(paperId, messageId);
  refresh();
  return note;
}

import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { llmForStage } from "../llm";
import { digestPrompt } from "../prompts/digest";
import { saveTags } from "../library";
import { requirementsFor } from "../requirements";
import { fetchPaperContent } from "./fetchPaper";
import { recentHistory, type Log } from "./select";

/** 超过这个长度的全文会被截断（并记录日志），避免超出小上下文模型的窗口 */
const MAX_PAPER_CHARS = 250_000;

export interface ParsedDigest {
  titleZh: string;
  oneLiner: string;
  tags: string[];
  contentMd: string;
}

/** 解析模型输出：开头的 --- 元信息块 + Markdown 正文 */
export function parseDigest(text: string): ParsedDigest {
  const m = text.match(/^\s*(?:```\w*\s*)?---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error("解读输出缺少元信息块");
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const contentMd = m[2].replace(/```\s*$/, "").trim();
  if (!meta.title_zh || !meta.one_liner) throw new Error("元信息缺少 title_zh 或 one_liner");
  if (!contentMd.includes("## ")) throw new Error("解读正文缺少分节");
  return {
    titleZh: meta.title_zh,
    oneLiner: meta.one_liner,
    tags: (meta.tags ?? "")
      .split(/[,，、]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8),
    contentMd,
  };
}

/** 按当前（或运行锁定的）写作要求生成解读，不写库；试写也用它 */
export async function generateDigest(pick: { paperId: string; reason: string }, log: Log): Promise<{ parsed: ParsedDigest; versionId: number }> {
  const content = await fetchPaperContent(pick.paperId, log);
  let paperText = content.text;
  if (paperText.length > MAX_PAPER_CHARS) {
    log(`全文 ${paperText.length} 字符，截断到 ${MAX_PAPER_CHARS}`);
    paperText = paperText.slice(0, MAX_PAPER_CHARS);
  }
  const history = recentHistory()
    .filter((h) => h.id !== pick.paperId)
    .map((h) => `- ${h.date.slice(0, 10)}《${h.title}》：${h.oneLiner}`)
    .join("\n");

  const llm = llmForStage("digest");
  const requirements = requirementsFor("digest");
  log(`撰写解读中（${llm.label}，写作要求 v${requirements.number}）…`);
  const prompt = digestPrompt({
    paper: paperText,
    figures: content.figures.map((f) => `${f.label} | ${f.caption}`).join("\n"),
    history,
    pickReason: pick.reason,
  });

  let parsed: ParsedDigest | undefined;
  let lastErr: unknown;
  for (let i = 0; i < 2 && !parsed; i++) {
    try {
      parsed = parseDigest(await llm.generate({ system: requirements.content, prompt }));
    } catch (e) {
      lastErr = e;
      log(`解读输出格式不符，重试：${String(e)}`);
    }
  }
  if (!parsed) throw lastErr;
  return { parsed, versionId: requirements.id };
}

/** 为一篇推荐生成解读并写库（新增一版修订并让它生效），返回 digest id */
export async function writeDigest(
  runId: number,
  pick: { paperId: string; reason: string; notable: boolean },
  log: Log,
): Promise<number> {
  const { parsed, versionId } = await generateDigest(pick, log);
  const values = {
    paperId: pick.paperId,
    runId,
    titleZh: parsed.titleZh,
    oneLiner: parsed.oneLiner,
    contentMd: parsed.contentMd,
    notable: pick.notable,
    pickReason: pick.reason,
  };
  const digestId = db.transaction((tx) => {
    const row = tx
      .insert(schema.digests)
      .values(values)
      .onConflictDoUpdate({ target: schema.digests.paperId, set: values })
      .returning({ id: schema.digests.id })
      .get();
    const rev = tx
      .insert(schema.digestRevisions)
      .values({ digestId: row.id, runId, titleZh: parsed.titleZh, oneLiner: parsed.oneLiner, contentMd: parsed.contentMd, tags: parsed.tags, requirementsVersionId: versionId })
      .returning({ id: schema.digestRevisions.id })
      .get();
    tx.update(schema.digests).set({ revisionId: rev.id }).where(eq(schema.digests.id, row.id)).run();
    return row.id;
  });
  saveTags(digestId, parsed.tags);
  log(`解读完成：《${parsed.titleZh}》，${parsed.contentMd.length} 字`);
  return digestId;
}

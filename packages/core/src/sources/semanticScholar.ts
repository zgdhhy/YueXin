import { fetchJson } from "../http";
import { isoDate } from "./types";

interface S2Paper {
  externalIds?: { ArXiv?: string };
  title: string;
  citationCount?: number;
  publicationDate?: string;
}

/**
 * 近期重要论文：按引用数排序的 arXiv 论文。
 * 时间窗口为 [now - toDays, now - fromDays]，避开新论文窗口。
 */
export async function fetchNotable(
  queries: string[],
  fromDays: number,
  toDays: number,
  perQuery = 30,
): Promise<{ arxivId: string; citations: number }[]> {
  const now = Date.now();
  const range = `${isoDate(new Date(now - toDays * 86400_000))}:${isoDate(new Date(now - fromDays * 86400_000))}`;
  const out = new Map<string, number>();
  for (const q of queries) {
    const url =
      "https://api.semanticscholar.org/graph/v1/paper/search/bulk" +
      `?query=${encodeURIComponent(q)}&sort=citationCount:desc&publicationDateOrYear=${range}` +
      `&fieldsOfStudy=Computer%20Science&fields=externalIds,title,citationCount,publicationDate`;
    try {
      const res = await fetchJson<{ data?: S2Paper[] }>(url);
      for (const p of (res.data ?? []).slice(0, perQuery * 2)) {
        const id = p.externalIds?.ArXiv;
        if (id && (out.get(id) ?? -1) < (p.citationCount ?? 0)) out.set(id, p.citationCount ?? 0);
      }
    } catch (e) {
      console.warn(`[s2] "${q}" 获取失败: ${String(e)}`);
    }
    // 未登录的 S2 接口限速较严
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [...out.entries()]
    .map(([arxivId, citations]) => ({ arxivId, citations }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, perQuery);
}

import * as cheerio from "cheerio";
import { fetchText } from "../http";
import { stripVersion, type PaperMeta } from "./types";

const API = "https://export.arxiv.org/api/query";

function parseFeed(xml: string): PaperMeta[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("entry")
    .map((_, el) => {
      const e = $(el);
      const idUrl = e.find("id").first().text();
      const id = stripVersion(idUrl.split("/abs/")[1] ?? idUrl);
      return {
        id,
        title: e.find("title").first().text().replace(/\s+/g, " ").trim(),
        abstract: e.find("summary").first().text().replace(/\s+/g, " ").trim(),
        authors: e.find("author > name").map((_, a) => $(a).text().trim()).get(),
        organization: null,
        publishedAt: e.find("published").first().text(),
        upvotes: 0,
        citations: null,
        keywords: [],
        arxivCategories: e.find("category").map((_, c) => $(c).attr("term") ?? "").get().filter(Boolean),
        githubUrl: null,
      } satisfies PaperMeta;
    })
    .get();
}

/** 指定分类下最近 days 天提交的论文 */
export async function fetchArxivRecent(categories: string[], days: number, max = 300): Promise<PaperMeta[]> {
  if (!categories.length) return [];
  const q = categories.map((c) => `cat:${c}`).join(" OR ");
  const url = `${API}?search_query=${encodeURIComponent(q)}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
  const cutoff = Date.now() - days * 86400_000;
  return parseFeed(await fetchText(url)).filter((p) => Date.parse(p.publishedAt) >= cutoff);
}

/** 按 id 批量获取元数据 */
export async function fetchArxivByIds(ids: string[]): Promise<PaperMeta[]> {
  if (!ids.length) return [];
  const out: PaperMeta[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    out.push(...parseFeed(await fetchText(`${API}?id_list=${chunk.join(",")}&max_results=${chunk.length}`)));
  }
  return out;
}

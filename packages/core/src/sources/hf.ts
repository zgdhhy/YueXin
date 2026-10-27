import { env } from "../env";
import { fetchJson } from "../http";
import { isoDate, stripVersion, type PaperMeta } from "./types";

interface HfDailyPaper {
  paper: {
    id: string;
    title: string;
    summary: string;
    authors: { name: string }[];
    publishedAt: string;
    upvotes: number;
    ai_keywords?: string[];
    githubRepo?: string;
    organization?: { fullname?: string; name?: string };
  };
}

function toMeta(d: HfDailyPaper): PaperMeta {
  const p = d.paper;
  return {
    id: stripVersion(p.id),
    title: p.title.replace(/\s+/g, " ").trim(),
    abstract: p.summary.replace(/\s+/g, " ").trim(),
    authors: p.authors.map((a) => a.name),
    organization: p.organization?.fullname ?? p.organization?.name ?? null,
    publishedAt: p.publishedAt,
    upvotes: p.upvotes ?? 0,
    citations: null,
    keywords: p.ai_keywords ?? [],
    arxivCategories: [],
    githubUrl: p.githubRepo ?? null,
  };
}

/** 最近 days 天 HF Daily Papers（按提交到 Daily 的日期） */
export async function fetchHfDaily(days: number, now = new Date()): Promise<PaperMeta[]> {
  const out = new Map<string, PaperMeta>();
  for (let i = 0; i < days; i++) {
    const date = isoDate(new Date(now.getTime() - i * 86400_000));
    try {
      const list = await fetchJson<HfDailyPaper[]>(`${env.hfEndpoint}/api/daily_papers?date=${date}&limit=100`);
      for (const d of list) {
        const m = toMeta(d);
        const prev = out.get(m.id);
        if (!prev || prev.upvotes < m.upvotes) out.set(m.id, m);
      }
    } catch (e) {
      console.warn(`[hf] ${date} 获取失败: ${String(e)}`);
    }
  }
  return [...out.values()];
}

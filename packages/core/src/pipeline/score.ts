import type { PaperMeta } from "../sources/types";

export interface TopicLike {
  name: string;
  arxivCategories: string[];
  keywords: string[];
  weight: number;
}

export interface ScoreBreakdown {
  total: number;
  popularity: number;
  topic: number;
  institution: number;
  matchedTopics: string[];
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 整词匹配（不区分大小写） */
function hasWord(text: string, word: string) {
  return new RegExp(`\\b${escapeRe(word)}\\b`, "i").test(text);
}

/** 规则初筛分：热度 + 主题匹配 + 机构加分。只用于缩小候选范围，最终由大模型精选。 */
export function ruleScore(
  p: Pick<PaperMeta, "title" | "abstract" | "upvotes" | "citations" | "organization" | "arxivCategories" | "keywords" | "githubUrl">,
  topics: TopicLike[],
  institutions: string[],
): ScoreBreakdown {
  const popularity = p.citations != null ? 3 * Math.log1p(p.citations / 5) : 3 * Math.log1p(p.upvotes);

  const text = `${p.title} ${p.abstract} ${p.keywords.join(" ")}`;
  let topic = 0;
  const matchedTopics: string[] = [];
  for (const t of topics) {
    const hits = t.keywords.filter((k) => hasWord(text, k)).length;
    const titleHit = t.keywords.some((k) => hasWord(p.title, k));
    const catHit = p.arxivCategories.some((c) => t.arxivCategories.includes(c));
    const s = Math.min(hits, 3) * 0.6 + (titleHit ? 1 : 0) + (catHit ? 0.3 : 0);
    if (s > 0) {
      topic += s * t.weight;
      matchedTopics.push(t.name);
    }
  }
  topic = Math.min(topic, 6);

  const org = `${p.organization ?? ""} ${p.abstract}`;
  const institution = institutions.some((i) => hasWord(org, i)) ? 2 : 0;

  const total = popularity + topic + institution + (p.githubUrl ? 0.5 : 0);
  return { total, popularity, topic, institution, matchedTopics };
}

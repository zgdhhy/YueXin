export interface PaperMeta {
  id: string; // arXiv id（无版本号）
  title: string;
  abstract: string;
  authors: string[];
  organization: string | null;
  publishedAt: string;
  upvotes: number;
  citations: number | null;
  keywords: string[];
  arxivCategories: string[];
  githubUrl: string | null;
}

export function stripVersion(id: string) {
  return id.replace(/v\d+$/, "");
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

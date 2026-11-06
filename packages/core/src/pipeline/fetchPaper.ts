import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import { db, schema } from "../db";
import { dataPath } from "../env";
import { fetchWithRetry } from "../http";

export interface PaperContent {
  source: "html" | "pdf";
  text: string;
  figures: { label: string; caption: string; path: string }[];
}

const clean = (s: string) =>
  s
    .replace(/\\captionlead/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** 把 arXiv HTML（LaTeXML 生成）转换成带标题层级的纯文本，公式保留为 LaTeX */
function htmlToText(html: string): { text: string; figures: { label: string; caption: string; src: string }[] } {
  const $ = cheerio.load(html);
  const article = $("article.ltx_document").first();
  article.find(".ltx_bibliography, nav, .ltx_page_footer, .ltx_authors").remove();
  article.find("math").each((_, m) => {
    const alt = $(m).attr("alttext") ?? "";
    const display = $(m).attr("display") === "block";
    $(m).replaceWith(display ? ` $$${alt}$$ ` : ` $${alt}$ `);
  });

  const figures: { label: string; caption: string; src: string }[] = [];
  const lines: string[] = [];
  const title = clean(article.find("h1.ltx_title_document").text());
  if (title) lines.push(`# ${title}`);

  const blocks = article.find("h2, h3, h4, h5, h6, div.ltx_para, .ltx_abstract > p, figure.ltx_figure, figure.ltx_table").toArray();
  for (const el of blocks) {
    const node = $(el);
    // 跳过嵌套在图表内的段落与子图
    if (node.parents("figure").length) continue;
    const tag = el.tagName ?? "";
    if (/^h[2-6]$/.test(tag)) {
      const level = Math.min(Number(tag[1]), 4);
      lines.push(`\n${"#".repeat(level)} ${clean(node.text())}`);
    } else if (tag === "figure") {
      const captionEl = node.children("figcaption").first();
      const label = clean(captionEl.find(".ltx_tag").first().text()).replace(/[:：.]$/, "");
      const caption = clean(captionEl.text()).replace(/^[^:：]*[:：]\s*/, "");
      if (node.hasClass("ltx_table")) {
        const rows = node
          .find("tr")
          .map((_, tr) => $(tr).find("td, th").map((_, c) => clean($(c).text())).get().join(" | "))
          .get();
        lines.push(`\n[${label || "Table"}] ${caption}\n${rows.join("\n")}`);
      } else {
        const src = node.find("img").first().attr("src");
        if (label && src) figures.push({ label, caption, src });
        lines.push(`\n[${label || "Figure"}] ${caption}`);
      }
    } else {
      // 段落里内嵌的图表单独处理，这里去掉避免重复
      const t = clean(node.clone().find("figure").remove().end().text());
      if (t) lines.push(t);
    }
  }
  return { text: lines.join("\n"), figures };
}

async function download(url: string, dest: string) {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function fromHtml(id: string, log: (s: string) => void): Promise<PaperContent | null> {
  const pageUrl = `https://arxiv.org/html/${id}`;
  const res = await fetchWithRetry(pageUrl);
  if (!res.ok) return null;
  const html = await res.text();
  if (!html.includes("ltx_document")) return null;
  const { text, figures } = htmlToText(html);
  const saved: PaperContent["figures"] = [];
  for (const [i, f] of figures.entries()) {
    const url = new URL(f.src, res.url || pageUrl).toString();
    const ext = path.extname(new URL(url).pathname) || ".png";
    const rel = path.posix.join("papers", id, `fig${i + 1}${ext}`);
    try {
      await download(url, dataPath(rel));
      saved.push({ label: f.label, caption: f.caption, path: rel });
    } catch (e) {
      log(`原图下载失败 ${f.label}: ${String(e)}`);
    }
  }
  return { source: "html", text, figures: saved };
}

async function fromPdf(id: string): Promise<PaperContent> {
  const res = await fetchWithRetry(`https://arxiv.org/pdf/${id}`);
  if (!res.ok) throw new Error(`PDF 获取失败 HTTP ${res.status}`);
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return { source: "pdf", text, figures: [] };
}

/** 获取论文全文与原图，缓存到 data/papers/<id>/ */
export async function fetchPaperContent(id: string, log: (s: string) => void): Promise<PaperContent> {
  const cacheFile = dataPath("papers", id, "content.json");
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));

  let content = await fromHtml(id, log).catch((e) => {
    log(`HTML 版本获取失败：${String(e)}`);
    return null;
  });
  if (!content) {
    log("没有 HTML 版本，改用 PDF 提取文本（无原图）");
    content = await fromPdf(id);
  }
  log(`全文 ${content.text.length} 字符，原图 ${content.figures.length} 张（来源：${content.source}）`);

  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(content));
  for (const f of content.figures) {
    db.insert(schema.figures)
      .values({ paperId: id, ...f })
      .onConflictDoUpdate({ target: [schema.figures.paperId, schema.figures.label], set: { caption: f.caption, path: f.path } })
      .run();
  }
  return content;
}

/** 已缓存的论文全文（截断到 max 字符）；没有缓存时返回空串，不发网络请求 */
export function cachedPaperText(id: string, max: number) {
  const file = dataPath("papers", id, "content.json");
  if (id.includes("..") || !fs.existsSync(file)) return "";
  const text = (JSON.parse(fs.readFileSync(file, "utf8")) as PaperContent).text;
  return text.length > max ? text.slice(0, max) : text;
}

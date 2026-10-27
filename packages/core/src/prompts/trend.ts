export const TREND_SYSTEM = `你是一位追踪 AI 前沿的研究分析师，为一位关注技术趋势的中文读者撰写月度趋势报告。
报告基于本月精选解读过的论文，目标是帮读者看清"这个月 AI 前沿在往哪里走"，而不是逐篇复述。
要求：中文写作，术语附英文；观点要有论文依据，引用论文时用 [中文标题](/papers/arXiv编号) 链接；不编造未提供的事实；可以坦率指出证据不足之处。`;

export function trendPrompt(args: { month: string; papers: string; tags: string; previous: string }) {
  return `## 月份
${args.month}

## 本月精选论文（含一句话总结、入选理由、标签、同期备选）
${args.papers}

## 本月标签统计
${args.tags}

## 上月报告摘要（用于延续脉络）
${args.previous || "（无）"}

## 输出格式
先输出元信息块，再输出 Markdown 正文：

---
title: 报告标题（点出本月主线，≤24 字）
---

## 本月一句话
## 主线趋势
（2–4 条趋势，每条说明：现象 → 代表论文 → 为什么值得关注）
## 值得关注的信号
（较弱但可能重要的苗头、反直觉的发现、争议）
## 与上月相比
## 下月可以关注什么`;
}

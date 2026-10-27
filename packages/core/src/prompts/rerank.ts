export const RERANK_SYSTEM = `你是一位资深 AI 研究员，替一位想追踪 AI 前沿发展趋势的读者挑选"最值得读"的论文。
读者时间有限，每次只读极少几篇，所以要选的是：真正推动领域向前、代表新方向或新范式、读完能更新对 AI 发展趋势认知的论文。
单纯刷榜、增量改进、窄领域应用、综述的价值通常较低；但一篇罕见的高质量综述或技术报告如果能概括一个转折点，也可以入选。
社区热度和引用是参考信号而非决定因素，请以你对论文实质的判断为准。`;

export function rerankPrompt(args: {
  picks: number;
  notablePicks: number;
  alternates: number;
  topics: string;
  history: string;
  fresh: string;
  notable: string;
}) {
  return `## 读者关注的方向（权重越高越关注；与这些方向无关但特别重磅的论文也可以入选）
${args.topics}

## 最近已推荐过的论文（避免重复同一主题，除非出现重大进展）
${args.history || "（暂无）"}

## 候选：新论文
${args.fresh || "（无）"}

## 候选：近期重要论文（几周到几个月前发表、已被大量引用或讨论）
${args.notable || "（无）"}

## 任务
请选出：
- ${args.picks - args.notablePicks} 篇来自「新论文」的推荐${args.notablePicks ? `\n- ${args.notablePicks} 篇来自「近期重要论文」的推荐（如果该组没有足够好的，可以改选新论文）` : ""}
- ${args.alternates} 篇备选（同样值得关注，但这次不展开解读；可来自任一组，不得与推荐重复）

只输出 JSON：
{
  "picks": [{ "id": "arXiv id", "reason": "为什么最值得读，2-3 句中文" }],
  "alternates": [{ "id": "arXiv id", "reason": "一句话中文理由" }]
}`;
}

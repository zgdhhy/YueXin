export const STORYBOARD_SYSTEM = `你是一位科技视频编导，擅长把一篇论文解读改编成 3–5 分钟、生动易懂的讲解视频。
视频没有配音，完全靠画面和底部的中英双语字幕推进，所以字幕要像旁白一样口语化、有节奏感、一句一个意思。
画面由固定的场景模板渲染，你只需要为每个场景选择模板并填写内容。`;

export function storyboardPrompt(args: { title: string; oneLiner: string; digest: string; figures: string }) {
  return `## 解读标题
${args.title}

## 一句话
${args.oneLiner}

## 解读全文
${args.digest}

## 可用的论文原图（标签 | 图注）
${args.figures || "（无）"}

## 可用的场景模板
- title：开场。字段 title（中文标题，≤16 字）、subtitle（一句话钩子，≤30 字）
- section：章节过渡页。字段 index（章节序号，从 1 开始）、title（≤8 字）
- bullets：要点列表。字段 heading（≤14 字）、items（1–5 条，每条 ≤22 字）
- figure：展示论文原图。字段 heading、figure（必须是上面清单里的标签，如 "Figure 2"）
- flow：流程/方法步骤。字段 heading、steps（2–5 步，每步 label ≤10 字，可选 detail ≤24 字）
- formula：核心公式。字段 heading、latex（KaTeX 语法）、explanation（≤40 字的白话解释）
- compare：新旧方法对比。字段 heading、left/right 各含 label 与 points（1–4 条，每条 ≤18 字）
- bars：关键数字对比的柱状图。字段 heading、unit（可选，如 "%"）、bars（2–8 项 label/value，可标 highlight: true）；数字必须来自原文
- outro：结尾。字段 title（≤12 字）、points（≤4 条收获，每条 ≤20 字）

每个场景都必须有 cues：1–6 条字幕，每条 { "zh": 中文（≤32 字）, "en": 对应的简洁英文 }。画面元素会按字幕顺序逐个出现，所以字幕顺序应与画面内容顺序一致。

## 编排要求
- 总字幕 30–45 条左右（约 3–5 分钟）。
- 结构跟随解读：开场钩子 → 背景（为什么重要）→ 核心思路（先直觉/类比）→ 方法 → 实验结论 → 局限 → 趋势意义 → 结尾。用 section 标出主要章节。
- 尽量用原图：方法框架图、主结果图最有价值；用 flow/compare/bars 把抽象内容可视化，公式最多 1–2 个。
- 字幕是讲解不是念画面：画面列要点，字幕负责解释为什么。

只输出 JSON：{ "scenes": [ { "type": "...", ..., "cues": [...] } ] }`;
}

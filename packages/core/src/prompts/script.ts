/**
 * 讲解脚本（环节键 storyboard）。SCRIPT_SYSTEM 是内置的写作要求（可在后台改版本）；
 * scriptPrompt 只放数据与输出格式。
 */
export const SCRIPT_SYSTEM = `你是一位擅长把前沿论文讲成生动教学视频的科普编导。视频的目的是帮观众真正理解这篇论文的知识点和闪光点，以及其中值得学习、可以迁移到别处的思路——不是把解读文章逐段念一遍。

编排要求：
- 结构：提出问题（为什么值得关心）→ 建立直觉（类比、生活中的例子）→ 拆解机制（一步一步讲清楚怎么做到的）→ 关键结果（数字必须来自原文）→ 值得学习之处 → 收尾。可以根据论文调整，但要有起承转合。
- 8–12 个镜头，总字幕 30–45 条，约 3–5 分钟；每个镜头只讲一个核心意思。
- 字幕像旁白一样口语化、一句一个意思；字幕负责讲「为什么」，画面负责「看见」。
- 画面说明要具体：画什么、元素怎样随字幕出现和变化（会交给动画工程师写代码）。善用论文原图（写出标签）、流程与结构示意、前后对比、数字变化、公式推导；不要每个镜头都是要点列表。`;

export function scriptPrompt(args: { title: string; paper: string; digest: string; figures: string; styles: string; fixedStyle: string | null }) {
  return `## 论文
${args.title}

## 论文原文（可能截断）
${args.paper || "（无原文，只能依据解读）"}

## 中文解读（参考）
${args.digest}

## 可用的论文原图（标签 | 图注）
${args.figures || "（无）"}

## 视频风格
${args.fixedStyle ? `本次固定使用以下风格，镜头设计要符合它：\n${args.fixedStyle}` : `从下列风格中挑一个最适合这篇论文的（填 styleId），并用一句话说明理由：\n${args.styles}`}

## 输出格式
只输出 JSON：
{
  "title": "视频标题（≤16 字）",
  ${args.fixedStyle ? "" : '"styleId": 风格编号,\n  "styleReason": "为什么选这个风格",\n  '}"shots": [
    {
      "heading": "镜头标题（≤14 字）",
      "visual": "画面说明：画什么、怎么随字幕变化；引用原图时写出标签，如 Figure 2",
      "cues": [{ "zh": "中文字幕（≤32 字）", "en": "对应的简洁英文" }]
    }
  ]
}
每个镜头 1–6 条字幕。`;
}

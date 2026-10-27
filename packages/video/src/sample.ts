import type { ExplainerProps } from "./storyboard";

/** Remotion Studio 预览用的示例数据 */
export const sampleProps: ExplainerProps = {
  readingSpeed: 5,
  musicUrl: null,
  musicVolume: 0.25,
  figures: {},
  meta: { arxivId: "2610.00000", paperTitle: "An Example Paper Title", date: "2026-10-21" },
  storyboard: {
    scenes: [
      {
        type: "title",
        title: "示例：把推理交给模型",
        subtitle: "一篇关于智能体设计范式转变的论文",
        cues: [{ zh: "今天我们来读一篇关于智能体的新论文。", en: "Today we read a new paper about agents." }],
      },
      { type: "section", index: 1, title: "背景", cues: [{ zh: "先看问题从哪里来。", en: "First, where the problem comes from." }] },
      {
        type: "bullets",
        heading: "过去的瓶颈",
        items: ["每一步都要截图", "只能点鼠标", "规则写死在框架里"],
        cues: [
          { zh: "传统智能体每一步都要看一次屏幕。", en: "Traditional agents look at the screen every step." },
          { zh: "而且只能通过鼠标键盘操作，规则也是写死的。", en: "They can only use mouse and keyboard, with hard-coded rules." },
        ],
      },
      {
        type: "flow",
        heading: "新方法的流程",
        steps: [{ label: "决定看什么" }, { label: "写一段程序", detail: "GUI 与代码混用" }, { label: "自我校验" }],
        cues: [{ zh: "新方法让模型自己决定看什么、怎么做。", en: "The model decides what to look at and how to act." }],
      },
      {
        type: "formula",
        heading: "形式化",
        latex: "(q_t, p_t, m_{t+1}) \\sim \\pi_\\theta(\\cdot \\mid m_t, o_t)",
        explanation: "每一步联合决定：观察、程序、工作记忆",
        cues: [{ zh: "用一个公式概括：三个决策联合输出。", en: "One formula: three decisions made jointly." }],
      },
      {
        type: "bars",
        heading: "OSWorld-v2 平均得分",
        unit: "",
        bars: [
          { label: "基线", value: 41.2 },
          { label: "OpenGCUA", value: 60.8, highlight: true },
        ],
        cues: [{ zh: "八个模型平均提升了 19.6 分。", en: "Average gain of 19.6 points across eight models." }],
      },
      {
        type: "outro",
        title: "一句话记住",
        points: ["把决策权交给模型", "用程序代替逐步点击"],
        cues: [{ zh: "以上就是今天的论文，我们下期见。", en: "That's all for today. See you next time." }],
      },
    ],
  },
};

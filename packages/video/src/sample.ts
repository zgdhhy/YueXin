import type { ExplainerProps } from "./script";
import { DEFAULT_TOKENS } from "./theme";

/** Remotion Studio 预览用：一个手写的镜头代码（已是 CommonJS）+ 两个退化为简单画面的镜头 */
const demo = `const { jsx, jsxs } = require("react/jsx-runtime");
const { Title, FadeIn, Card, revealAt } = require("@kit");
module.exports.default = function Shot(p) {
  const items = ["每一步都要截图", "只能点鼠标", "规则写死在框架里"];
  return jsxs("div", { children: [
    jsx(Title, { children: "过去的瓶颈" }),
    ...items.map((t, i) => jsx(FadeIn, { delay: revealAt(i, items.length, p.cueStarts), style: { marginBottom: 20 }, children: jsx(Card, { style: { fontSize: 40 }, children: t }) }, i)),
  ] });
};`;

export const sampleProps: ExplainerProps = {
  readingSpeed: 5,
  musicUrl: null,
  musicVolume: 0.25,
  figures: {},
  style: DEFAULT_TOKENS,
  meta: { arxivId: "2610.00000", paperTitle: "An Example Paper Title", date: "2026-10-21" },
  shots: [
    { heading: "把推理交给模型", cues: [{ zh: "今天我们来读一篇关于智能体的新论文。", en: "Today we read a new paper about agents." }], js: null, narration: null },
    {
      heading: "过去的瓶颈",
      cues: [
        { zh: "传统智能体每一步都要看一次屏幕。", en: "Traditional agents look at the screen every step." },
        { zh: "而且只能通过鼠标键盘操作，规则也是写死的。", en: "They can only use mouse and keyboard, with hard-coded rules." },
      ],
      js: demo,
      narration: null,
    },
    { heading: "值得学习的地方", cues: [{ zh: "把决策权交给模型，框架只提供工具。", en: "Let the model decide; the harness only provides tools." }], js: null, narration: null },
  ],
};

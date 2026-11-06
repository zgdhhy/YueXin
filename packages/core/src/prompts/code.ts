/**
 * 动画代码（环节键 code）。CODE_SYSTEM 是内置的写作要求（可在后台改版本）；
 * codePrompt 给出镜头内容、风格与固定的代码约定（ADR 0003）。
 */
export const CODE_SYSTEM = `你是一位 Remotion 动画工程师，为论文讲解视频的一个镜头写画面代码。
写作要求：
- 动画服务于讲解：画面元素跟着字幕依次出现（用 cueStarts），一次只强调一件事，观众的视线要有落点。
- 动效流畅克制：入场用 spring 或 interpolate 平滑过渡，避免闪烁、旋转、无意义的抖动。
- 文字要大、要少：正文不小于 34px，标题 48–64px；不要大段文字。
- 画面要填满内容区但不能溢出：用 flex 布局，给图片设置最大宽高。
- 优先使用 @kit 里的组件，它们会自动套用当前风格的配色和字体；自定义颜色时从 style.colors 取。`;

const API = `## 代码约定（必须遵守）
- 用 TypeScript + TSX 写一个组件并 export default，例如 export default function Shot(props: ShotProps) { ... }。
- 只能 import 三个模块：
  - "react"
  - "remotion"：useCurrentFrame, useVideoConfig, interpolate, spring, Easing, AbsoluteFill, Sequence, Img
  - "@kit"：
    useStyle() → 当前风格 { colors: { bg, bg2, surface, border, text, muted, primary, accent }, fonts: { heading, body } }
    useEnter(delay?, damping?) → 0→1 的弹性入场进度
    revealAt(i, n, cueStarts) → 第 i 个（共 n 个）元素出现的帧
    <FadeIn delay from="up|left|right|none">…</FadeIn>
    <Title delay size>标题</Title>
    <Card style>…</Card>
    <Figure label="Figure 2" delay zoom style /> 论文原图（只能用下面列出的标签）
    <Formula latex="..." size /> KaTeX 公式
    <DrawPath d="M0 0 L100 0" viewBox="0 0 100 10" delay duration stroke width style /> 逐渐画出的线条
    <Counter to={87.3} from={0} delay duration decimals={1} suffix="%" style />
    <BarChart bars={[{ label, value, highlight }]} unit delay height />
    <Highlight x y w h delay color /> 内容区坐标处的强调框（需要父元素 position: relative）
- props（ShotProps）：width、height（内容区像素尺寸，约 1720×760）、durationInFrames、cueStarts（每条字幕开始的帧）、figures、style。帧率 30。
- 动画只能由 useCurrentFrame() 驱动：不要用 CSS transition / animation / keyframes，不要用 setTimeout、useEffect 做动画。
- 不要访问网络、浏览器全局对象或外部资源；不要用 window、document、fetch 等。
- 字幕和标题栏由框架绘制，不要在画面里重复字幕全文。`;

export function codePrompt(args: { style: string; heading: string; visual: string; cues: string; figures: string; index: number; total: number }) {
  return `## 视频风格
${args.style}

## 本镜头（第 ${args.index} / ${args.total} 个）
标题：${args.heading}
画面说明：${args.visual}
字幕（按出现顺序，cueStarts[i] 对应第 i 条）：
${args.cues}

## 可用的论文原图标签
${args.figures || "（无）"}

${API}

只输出一个 \`\`\`tsx 代码块。`;
}

/** 按读者的意见修改一个镜头的代码 */
export function revisePrompt(args: Parameters<typeof codePrompt>[0] & { code: string; instruction: string }) {
  return `${codePrompt(args)}

## 现在的代码
\`\`\`tsx
${args.code}
\`\`\`

## 修改意见
${args.instruction}

在现有代码基础上按意见修改，输出修改后的完整代码。`;
}

---
name: 论文精读
description: 以真实论文图示和中文长文为核心的科学阅读出版物。
colors:
  paper: "#ffffff"
  ink: "#202d3b"
  body: "#475462"
  muted: "#626e7a"
  accent: "#304559"
  accent-hover: "#1f3247"
  surface: "#eef1f4"
  surface-hover: "#e7ecf1"
  wash: "#f6f7f9"
  line: "#e5e8ec"
  on-ink-muted: "#bdc9da"
typography:
  display:
    fontFamily: '"Reading Display", "Noto Serif SC", Georgia, serif'
    fontSize: "64px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  collection:
    fontFamily: '"Reading Display", "Noto Serif SC", Georgia, serif'
    fontSize: "42px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: '"Reading Display", "Noto Serif SC", Georgia, serif'
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.65
    letterSpacing: "0em"
  feature:
    fontFamily: '"Reading Display", "Noto Serif SC", Georgia, serif'
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.65
    letterSpacing: "0em"
  section:
    fontFamily: '"Reading Display", "Noto Serif SC", Georgia, serif'
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.6
  body:
    fontFamily: '"Reading Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.95
  summary:
    fontFamily: '"Reading Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.95
  label:
    fontFamily: '"Reading Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
  control:
    fontFamily: '"Reading Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 500
rounded:
  flat: "0px"
  action: "6px"
  tool: "6px"
  history: "8px"
  composer: "9px"
  toolbar: "10px"
  popup: "12px"
spacing:
  control-gap: "8px"
  history-gap: "12px"
  list-padding: "16px"
  compact-panel: "20px"
  copy-gap: "24px"
  overview: "28px"
  section: "32px"
  page: "40px"
  spread: "56px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.action}"
    padding: "8px 8px 8px 18px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-standard:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.action}"
    padding: "12px 19px"
  navigation:
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    height: "68px"
  navigation-current:
    textColor: "{colors.ink}"
  figure-selector:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "6px 8px"
  figure-selector-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  history-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.history}"
    padding: "0 10px"
  history-card-current:
    backgroundColor: "{colors.surface}"
  composer:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.composer}"
    padding: "7px 8px 7px 13px"
  note-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    rounded: "{rounded.flat}"
    padding: "12px 0"
---

# Design System: 论文精读

> 首页独立采用下述配色（2026-11-03 第二次调整）。其余合集与文章继续采用本文件原有浅色规范。

## Homepage: 宣纸、松烟墨与铜色

- 配色只在 `app/(site)/home.css` 顶部的变量里定义，换色只改这一处：画布 #f6f3ec，卡片 #fdfcf8，浅底 #efeadf，墨 #24262b，正文 #55534d，说明 #6a665d，强调铜色 #85613b（只用于标题第二行、「最新解读」和文字链接），主按钮为墨色底。分隔线统一 `--line`（#2c261a1c）。
- 对比度：说明字在画布、卡片、浅底上分别为 5.16、5.57、4.77；铜色在画布上 5.03；按钮文字 14.39。
- 论文原图底保持纯白，不随主题染色。
- 结构：首屏左侧只有标题、一句介绍和「探索论文库」；右侧重点论文卡片下压一张微微旋转的纸。下方是趋势月报和研究方向两张卡片（方向显示篇数），多于一篇时再显示「继续阅读」。导航胶囊和页脚两端都对齐内容版心。
- 图示与视频叠在同一个网格单元里，卡片高度取两者较大值，切换不跳动；图注同样叠放，按最长的一条占位，完整显示不滚动。只有图示或只有视频时不显示切换。视频时长显示在切换按钮里。
- 小于 768px 时单列、取消旋转的底纸、左右 16px，导航收进原生 dialog 菜单。

## Overview

**Creative North Star: "科学阅读出版物"**

暖灰画布（#f7f7f5）、白色内容面、炭蓝墨色与真实论文图示构成阅读环境。文章正文页保留白底。中文衬线标题建立出版物的辨识度，中文无衬线正文维持长文、公式和操作控件的清晰度。视觉重点来自研究材料和排版层级。

页面有明确的内容密度：图、标题、摘要和链接相互对齐；阅读时保留稳定的正文行宽。工具以独立浮窗承载，不挤动文章。界面文字只承担识别、导航和必要反馈，避免靠重复标语解释布局。

**Key Characteristics:**
- 真实论文图示与中文内容优先。
- 衬线编辑标题，无衬线正文与控件。
- 暖灰画布、白色内容面与冷灰图场，炭蓝操作和焦点。
- 不对称内容网格、悬浮导航与克制的容器层次。

## Colors

规范色值由 frontmatter 定义；源代码变量作用域是阅读站容器，不是全局根节点。

### Primary

- **炭蓝（accent）**：阅读入口、链接、阅读进度与键盘焦点；悬停采用 accent-hover。

### Neutral

- **纸白（paper）**：卡片、文章与写作面；索引页外层画布为 #f7f7f5。
- **深蓝墨（ink）**：标题、选中图号与视频区背景。
- **正文墨（body）**：长文与较长摘要。
- **说明灰蓝（muted）**：日期、图注与次要操作。
- **图场灰蓝（surface / surface-hover）**：论文原图背景、研究方向条目及当前会话。
- **轻底（wash）与分隔线（line）**：概览、编辑框底色和工具边界。
- **反白辅助字（on-ink-muted）**：深蓝视频区中的描述。

**The Evidence Rule.** 图表保留论文原始内容和配色；界面强调色不能改写研究证据。

## Typography

**Display Font:** Reading Display，来自 Noto Serif SC 的本地子集，600。

**Body Font:** Reading Sans，来自 Noto Sans SC 的本地子集，400–600。字体按 WOFF2 自托管，子集外字符采用已声明的回退字体。

标题饱满、正文从容；不要恢复此前轻薄的中文字体。首页 display、合集 collection、文章 title、重点论文 feature、编辑分节 section、正文 body 和小字 label 的桌面值均见 frontmatter。文章内小节仍采用正文无衬线字体，不能把编辑标题字体自动套进全部 h2。

首页标题在 1199、999、639px 以下依次为 54、46、42px；文章标题在手机为 28px；合集为 34px。正文手机为 17px，保留 1.95 行高。日期使用等宽数字。图注与元数据通常为 13px；手机图选控件及图注为 12px。正文标题和段落分别采用 balance 与 pretty 的换行提示。

## Layout

共享主容器最大宽度 1328px，桌面左右内距 40px；899px 以下为 28px，639px 以下为 18px。导航桌面高 68px，手机品牌行与 46px 导航行分开，保持五个清晰入口。

论文与月报共用 ReaderWorkspace 阅读工作台。阅读页移除顶部站点浮动导航，保留文章标题；正文最大 760px，标题、开篇内容与正文对齐。桌面 900px 起默认显示紧贴正文左侧的 168px 目录，间距 24px，无目录按钮。正文优先以屏幕中心定位，打开面板后空间足够仍保持该位置；空间不足时目录保持 168px，正文填满面板外剩余阅读区，最小 520px。助手、笔记与论文信息（月报为月报信息）按钮悬浮于面板内容之上，开关时保持位置，按钮组距右停靠窗口边框留 8px，浮动和全屏留 16px；内容不为按钮预留整列空间，仅追问输入框避让。滚动条位于右侧独立窄轨道，工具按钮与轨道保持间距，内容末尾保留可滚动空隙，保证最后一行能滚到按钮上方；笔记保存操作移至左侧。另提供返回文章顶部按钮。同期值得关注的原论文归入论文信息。首次调用默认右侧停靠 420px，可左侧停靠、浮动或全屏；停靠宽 360–720px，分隔间距 24px，空间不足时临时浮动；每次重新打开默认右侧停靠，仅保留尺寸。浮窗默认 480×600px，最小 360×360px，受视口边界约束。手机沿用原有覆盖窗口，本次不调整手机布局。历史卡片间隔 12px。

首页使用 2:1 主次网格，间隔 24px。左侧重点论文包含标题、图示／视频切换和默认收起的阅读提要；右侧月报与方向各自成组。999px 以下主论文独占一行、侧栏两列；639px 以下全部单列。媒体切换保留容器高度，切离视频时暂停播放。

面板从右下角入口以 360ms 弹性缩放展开，以 260ms 缩回入口，结束后隐藏。动画仅作用于窗口主体，悬浮按钮位置不参与缩放，入口图标轻微抖动、窗口回弹后收敛；切换视图和拖拽不重复播放，尊重减少动态效果设置。笔记仅提供直接编辑的渲染界面，输入或粘贴 Markdown 即排版，支持表格、代码与公式；点击正在编辑的元素显示对应 Markdown 标记，不提供独立源码模式。笔记与高亮条目占满内容宽度，右侧工具按钮悬浮其上，允许覆盖条目，不预留避让列。

**The Stable Reading Rule.** 停靠允许正文重新排版，但打开、关闭、切换模式及拖拽调宽时须保持当前可见正文块的视口偏移。浮动不占正文空间。点击正文不收起面板，切换页签和模式不清空草稿或中断请求。浏览器仅记住停靠宽度和浮窗尺寸，不记录窗口模式或坐标；每次重新打开默认右侧停靠，空间不足时临时浮动。每次进入解读仍先收起面板。窗口菜单和会话内部状态优先消费 Escape；全屏 Escape 恢复前一模式，之后才收起面板。分隔线支持方向键、Shift 加速和 Home/End。

## Elevation & Depth

出版内容以留白、细边界和 12px 容器区分主次。导航仅有很轻的结构阴影；工具条为 `0 4px 24px #202d3b0a`，浮窗为 `0 18px 64px #202d3b0b`。悬停位移仅用于精确指针，卡片上移 2px。

首页下方内容使用一次性 450ms、12px 入场；减少动态效果和可见键盘焦点时跳过。图示和媒体切换为 180ms，键盘切换不播放动画。正文不编排入场；减少动态效果时停止动画，内容默认可见。

## Shapes

内容卡片和导航为 12px，图场及标签组为 8px；普通动作 6px、浮动工具条 10px、窗口 12px、历史卡片 8px、组合输入框 9px。边界为 1px；键盘焦点为 2px 炭蓝实线。

标识是项目内编写的深色圆角书页叠层，操作图标统一由 `components/reading-icons.tsx` 提供，默认 1.6px 线宽。SVG 和 Apple 图标使用同一标识；不增加图标依赖。素材来源见 [.impeccable/assets.md](.impeccable/assets.md)。

## Components

### Buttons

首页阅读动作采用 button-primary，文字为 14px、500 字重，和圆形箭头底座间距 24px；普通主要动作采用 button-standard，最小高 42px、间距 10px。悬停变为深蓝；禁用控件降低至 0.5 透明度并取消指针提示。通用键盘焦点为蓝色 2px、偏移 4px。

### Navigation

五个文字入口，当前入口为深墨色 500 字重、浅灰填充的 6px 圆角块；普通状态为说明灰蓝，悬停为研究蓝。用 aria-current 标记当前位置，手机保留全部入口。

### Figure selector

图号组成有名称的选择组，按钮最小 40×32px，粗指针时高 44px；选中时浅灰底和深墨字，并用 aria-pressed 表达。原图以 contain 完整呈现，点击可打开原图；图注随选择更新并使用 polite 通知。不要裁切研究证据去填满装饰容器。

### Cards / Containers

论文条目是白色、细边界、12px 圆角的出版单元；会话卡片是操作列表。会话行最小高 70px，标题 13px、500 字重，日期 13px；选中会话以蓝边及浅蓝底识别。重命名和删除保留独立入口与确认状态，卡片之间保持可辨识的留白。

### Inputs / Fields

问答组合输入框聚焦时用 focus-within 变白并出现 2px 蓝边，偏移 -1px；内部 textarea 不重复画轮廓。笔记写作面为平面白底，focus-visible 画 2px 蓝色轮廓、偏移 3px。问答输入桌面为 13px / 24px，手机为 16px，笔记为 14px / 1.95。发送按钮为 32px 方形、6px 圆角；禁用时变浅底和说明字色。

## Do's and Don'ts

### Do:

- **Do** 优先使用真实论文图示、准确图注和已发布内容。
- **Do** 沿用 frontmatter 中的色彩、字体角色和实际组件尺寸。
- **Do** 保持正文稳定，使用独立浮窗承载问答、历史和笔记。
- **Do** 为键盘操作保留清晰蓝色焦点，并兼顾减少动态效果偏好。
- **Do** 让必要控件具有可读名称、选中状态与语义属性。

### Don't:

- **Don't** 添加多余标语、重复说明和次要标签来弥补布局。
- **Don't** 把首页主次比例或某个页面的内容组织当作全站禁令。
- **Don't** 裁切、重绘或虚构论文图表与研究结果。
- **Don't** 用样式重构改变文章内容、数据、认证和既有阅读操作。


阅读面板的追问输入框为底部悬浮白色圆角卡片，右侧避让工具按钮，内容在卡片后方连续滚动；用户消息以通栏浅底圆角块展示。笔记采用同样的右侧滚动轨道与悬浮底部保存卡片，保留直接编辑渲染内容和源码切换。滚动末尾留白保证全文可滚到浮层上方。


窗口不足以同时容纳停靠面板与阅读区时，浮层固定在右下角，关闭重开不移动工具按钮，只显示全屏切换，不提供其他摆放方式或拖拽。工具按钮 48px、图标 22px；弹窗隐藏滚动条，保留滚轮、触控板及键盘滚动。对话、笔记和输入文字为 16px，源码为 14px。笔记源码可直接编辑，与渲染编辑器共享同一草稿与保存操作，保留有意义的 Markdown 缩进。展开和收回使用分段速度曲线，回弹后展开、轻微蓄力后收回，并尊重减少动态效果设置。


论文信息面板使用圆圈 i 图标（原生 24px SVG，1.7px 线宽）。来源编号和日期为次级信息，原文标题使用 21px、600 字重；原论文入口以炭蓝实底高亮，PDF 与代码为描边辅助操作。作者与机构分组，机构使用强调色与字重，研究方向使用浅底链接。同期原论文以加粗标题和独立段落说明理由，不添加额外标语。此信息面板的紧凑文字级别为 12/13/14/15/21px，链接圆角 7px，方向标签圆角 5px，沿用阅读页颜色变量。

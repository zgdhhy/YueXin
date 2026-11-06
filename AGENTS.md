# AGENTS.md

1. 删掉多余的标语，说明文字和次要标签。如果删完界面就看不懂了，说明布局本身就有问题，直接重新设计。
2. 每次修改都要兼顾用户体验，开发体验和Ai agent的使用体验。三个都要变好。而且不能破坏现有功能。
3. 目前不需要关注手机布局调整
4. 改界面时设计类 skill 的优先级：
   - 整体方向听 `frontend-design`，气质偏学术、好读、安静
   - 具体数值（间距、字号、颜色、阴影）听 `refactoring-ui`
   - `ui-ux-pro-max` 只作配色和字体的参考，不直接套用整套风格
   - 动效由 `creative-coder` 把关，宁少勿多
   - 冲突时以本文件第 1 条为准
## 项目地图

精读站的术语以 [GLOSSARY.md](GLOSSARY.md) 为准，产品说明见 [README.md](README.md)，关键决策见 `docs/adr/`，阅读站视觉规范见 `apps/web/DESIGN.md`，后台规范见 `docs/admin-ui.md`。

```
apps/web/app/(site)        前台页面；样式 reading-site.css → theme.css → home.css
apps/web/app/admin         后台页面；写操作在 actions.ts
apps/web/components/reader 论文与月报共用的阅读工作台（面板、追问、笔记、划线）
apps/web/components/admin  后台外框与表单控件
apps/web/components/site   前台卡片、导航与首页媒体
apps/web/components/*      跨区共用：Markdown、chat、reading-icons、site-mark
apps/web/lib               服务端数据与工具；lib/reader 是阅读工作台的纯逻辑
apps/worker                定时计划与运行队列（index.ts）、手动运行（cli.ts）
packages/core              数据库、大模型适配、流水线（pipeline/run.ts 是一次运行的入口）
packages/video             Remotion：src/kit.tsx 是生成的镜头代码可用的组件，render/ 是渲染与音乐
```

## 常用命令

```bash
npm run check          # 全部类型检查 + 单元测试，改完先跑它
npm run check:reader   # 阅读工作台浏览器回归（独立数据库，不调用真实模型）
npm run db:generate    # 改 packages/core/src/db/schema.ts 后生成迁移
```

其余浏览器回归和截图工具见 README「浏览器回归」。

## 约定

- web 与 worker 是两个进程，只通过 SQLite 协作：web 往 `runs` 插入排队记录，worker 串行执行。
- `proxy.ts` 只检查 cookie 是否存在。新增页面、server action 和接口时必须调用 `requireAuth()`。
- 流水线调用模型只用 `llmForStage(stage)`，模型在运行开始时固定为快照（ADR 0002）。
- 不要手改生成文件：`packages/core/src/llm/cc-switch-presets.ts`、`icon-assets.ts`（由 `scripts/sync-*.mjs` 生成）。
- 需要数据库的测试，在导入 `./db` 之前把 `DATA_DIR` 指向临时目录。
- 阅读页的颜色变量同时写在 `app/tokens.css` 和 `reader-workspace.css`，改一处要同步另一处（`design-tokens.test.ts` 会检查）。
- 收藏、阅读状态已下线：`paper_marks` 只读取历史数据，删除解读时写入不感兴趣。表结构保留，不要再加写入入口。
- 判断代码有没有用，要考虑不走 import 的引用：Next 约定文件、`kit.tsx` 的导出、动态拼接的类名（如 `reader-window-resize-*`、`notebook-heading-*`）。

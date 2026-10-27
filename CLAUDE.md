# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

1. 删掉多余的标语，说明文字和次要标签。如果删完界面就看不懂了，说明布局本身就有问题，直接重新设计。
2. 每次修改都要兼顾用户体验，开发体验和Ai agent的使用体验。三个都要变好。而且不能破坏现有功能。

## 项目概述

自动追踪 AI 前沿论文：定时选题 → 生成 8 段式中文解读 → 渲染双语字幕讲解视频 → 推送通知；每月生成趋势月报。npm workspaces 单仓，Node ≥ 22，全部 TypeScript（ESM）。代码注释、日志、界面文案均为中文。

领域术语以 [GLOSSARY.md](GLOSSARY.md) 为准（推荐/备选/解读/分镜/运行/服务商/环节/覆盖/运行配置快照等），命名和文案使用其中的词，避开标注为「避免」的同义词。关键设计决策见 `docs/adr/`，演进路线与已定的产品决策见 `docs/roadmap.md`，后台界面规范见 `docs/admin-ui.md` 与 `docs/design-scheme-a.md`。

## 常用命令

```bash
npm install
cp .env.example .env              # 至少设置 ADMIN_PASSWORD、SESSION_SECRET（≥32 字符）
npm run dev:web                   # Next.js，http://localhost:3000
npm run dev:worker                # 另开终端：定时计划 + 运行队列
npm run typecheck                 # 所有 workspace 的 tsc（无 lint 配置）
npm test                          # @paper/core 测试（node:test + tsx）
npm test -w @paper/video          # 视频包测试
npm run db:generate               # 修改 packages/core/src/db/schema.ts 后生成迁移
npm run build -w @paper/web       # 生产构建
```

单个测试文件（node:test，需在包目录下运行）：

```bash
cd packages/core && node --import tsx --test src/pipeline/score.test.ts
cd packages/core && node --import tsx --test --test-name-pattern="关键词" src/model-policy.test.ts
```

需要数据库的测试在导入 `../db` 之前把 `process.env.DATA_DIR` 指向临时目录，新测试照此做，避免写入 `data/app.db`。

手动运行流水线（同步执行，不经 worker）：

```bash
npm run run-once -w @paper/worker                       # 按当前配置自动选题
npm run run-once -w @paper/worker -- 2610.22200         # 解读指定 arXiv id
npm run run-once -w @paper/worker -- --video 1          # 只重做解读 #1 的视频
npm run run-once -w @paper/worker -- --report 2026-10   # 指定月份月报
npm run studio -w @paper/video                          # Remotion Studio 预览场景
```

浏览器回归（使用 playwright-core + Remotion 下载的 chrome-headless-shell，不调用真实模型）：

- 模型界面：先生产构建，以 `DATA_DIR=data/ui-policy-fixture` 在 3101 端口 `npm run start -w @paper/web -- -p 3101`，再运行 `npx tsx scripts/check-model-ui.ts`。脚本会清空该 fixture 库的模型数据。同一服务还可跑 `check-model-layout.ts`、`check-cc-switch-ui.ts`。
- 布局：对本地 3000 服务运行 `node --experimental-strip-types scripts/check-layout.ts`，截图在 `data/scheme-a-review/`。
- 截图任意页面：`npx tsx scripts/screenshot.ts /admin /admin/models`（`SHOT_MOBILE=1` 手机尺寸）。

国内网络访问 huggingface.co 不稳定：`.env` 设 `HF_ENDPOINT=https://hf-mirror.com` 或 `HTTPS_PROXY`。

## 架构

### 包与运行方式

- `packages/core`：数据库、大模型适配、流水线。**不需要构建**——`package.json` 的 `exports` 直接指向 `.ts` 源码；web 通过 `transpilePackages` 编译，worker 用 `tsx` 运行。
- `packages/video`：Remotion 工程。`src/storyboard.ts` 是分镜 zod schema 与时间轴，`src/scenes/` 是场景组件，`render/` 是 Node 侧渲染与音乐合成（被 core 导入）。
- `apps/web`：Next.js 16 App Router。`(site)` 为前台阅读，`admin/` 为后台，所有写操作在 `app/admin/actions.ts` 的 server actions 中。
- `apps/worker`：常驻进程 `src/index.ts` 和一次性 CLI `src/cli.ts`。

### web 与 worker 通过 SQLite 协作

两个独立进程各自打开同一个 `DATA_DIR/app.db`（WAL + busy_timeout），没有其他 IPC：

- web 只往 `runs` 表插入 `queued` 记录（`enqueueRun`），不执行流水线。
- worker 每 5 秒取队列、**串行**执行（`executeRun`）；每 30 秒从 `schedules` 表同步定时计划（每种运行一行，后台只编辑星期/日期 + 时间，cron 由 `schedule-plan.ts` 生成；修改无需重启）并写心跳到 `settings`（后台据此显示 worker 是否在线）。启动时把残留的 `running` 运行标记为失败。
- 迁移（`packages/core/drizzle/`）在两个进程打开数据库时自动执行。
- `env.ts` 从 cwd 向上查找含 `workspaces` 的 `package.json` 作为根目录并加载根目录 `.env`；所有运行数据用 `dataPath()` 定位在 `DATA_DIR` 下。

### 一次运行（`packages/core/src/pipeline/run.ts`）

1. 在认领 `queued` 运行的同一事务里调用 `createModelSnapshot()`，把各环节的模型、接口地址、调用策略固定写入 `runs.params.modelSnapshot`（ADR 0002）。快照不含凭据，请求时仍读最新 Key / 刷新 OAuth；被运行引用的模型和服务商在运行结束前不能删除（`assertNotRunning`）。
2. `withRunContext()` 用 AsyncLocalStorage 携带 runId 与快照；流水线代码只调用 `llmForStage(stage)`，由它解析主模型/备用模型（主模型失败后用备用重试一次）并记录用量。环节为 `rerank | digest | storyboard | report`。
3. 每个步骤包在 `step()` 中，日志实时写入 `run_steps`，后台可看进度。
4. 选题（`select.ts` + `score.ts`：采集 `sources/` → 规则打分 → 大模型精选）→ 解读（`fetchPaper.ts` 取 arXiv HTML/PDF 与原图，`digest.ts`）→ 视频（`video.ts`：分镜 + 渲染）→ 通知（`notify.ts`）。视频和通知失败只记在步骤里，不让运行失败；单篇解读失败会跳过该篇。通知按事件（新解读 / 新月报 / 运行失败）发给订阅了该事件的渠道，手动与定时运行一视同仁；运行失败或定时计划因配置问题被跳过时发送失败告警。
5. `configurationIssue()` 非空（例如未确认默认模型）时，定时计划和 CLI 都不会启动模型运行。

提示词集中在 `packages/core/src/prompts/`。

### 大模型适配（`packages/core/src/llm/`）

协议：`anthropic`、`openai`（Chat Completions）、`responses`、`gemini`、`codex`（ChatGPT 订阅 OAuth，见 `oauth.ts`）。服务商连接选项（完整端点、独立模型列表地址、认证头、超时）定义在 `connection.ts`；错误信息要经 `redactProviderError` 脱敏。全局默认模型与环节覆盖存储在 `model-policy.ts`（`modelPolicy` 设置项）。

`cc-switch-presets.ts` 与 `icon-assets.ts` 由 `scripts/sync-cc-switch-presets.mjs`、`scripts/sync-provider-icons.mjs` 从已下载的 CC Switch 源码生成，不要手改；适配范围见 `docs/third-party/cc-switch.md`。

### 设置

`settings.ts` 是键值表 `settings` 上的一层：每个键都有 zod schema 和默认值，读取时把默认值与存储值合并后再解析（解析失败回退默认值）。新增字段只需在 schema 和 default 中补上。

### 视频（当前实现：ADR 0001）

大模型只输出符合 `storyboardSchema` 的结构化分镜（场景类型 + 中英字幕 + 引用的原图标签），由固定的 Remotion 场景组件渲染。要增强表现力就新增场景类型，不要让模型生成动画代码。渲染时 webpack 打包在进程内只做一次，并临时起本地 HTTP 服务把 `DATA_DIR` 中的图片和音乐提供给无头浏览器。ADR 0003（逐镜头生成动画代码）已决定取代此方案，但属于路线图阶段 5，尚未实现；在那之前按上述方式开发。

### 鉴权

单一密码登录，iron-session cookie `paper_session`。`apps/web/proxy.ts`（Next 16 的 middleware）只检查 cookie 是否存在；真正的校验是每个页面和 server action 入口调用 `requireAuth()`，新增后台页面或 action 时必须加上。`/files/[...path]` 路由提供 `DATA_DIR` 中的文件。

## 部署

`docker compose`：web 与 worker 使用同一镜像，共享挂载 `./data`；web 只监听 `127.0.0.1:3000`，外部需反向代理。worker 需要较大的 `shm_size` 来渲染视频，`RENDER_CONCURRENCY` 控制渲染并发。

# 论文web · AI 前沿论文精读

自动追踪 AI 前沿：定时挑选最值得读的论文，生成层层递进的中文解读和带双语字幕的讲解视频，每月汇总成趋势月报，并推送到邮箱、飞书、企业微信或钉钉。

领域术语见 [GLOSSARY.md](GLOSSARY.md)，关键设计决策见 [docs/adr/](docs/adr/)。

## 工作流程

一次**运行**的步骤如下：

1. **采集**：从 HF Daily Papers（带社区点赞数）和 arXiv（按你关注的方向分类）拉取近 N 天的新论文。抽中"近期重要论文"名额时，再从 Semantic Scholar 拉取近几个月的高引论文。
2. **初筛**：按热度、主题关键词和头部机构打一个规则分，去掉已经推荐过的论文，取前 20 篇左右。
3. **精选**：大模型阅读候选的标题和摘要，选出推荐论文和 2–3 篇备选。
4. **解读**：读取 arXiv HTML 全文和原图（没有 HTML 版本时退回 PDF），按论文特点自由组织中文研究文章，覆盖问题、贡献、机制、证据和局限；有实质联系时关联历史推荐。默认目标约 4000–7000 字符，新规范先试写，再主动启用。
5. **视频**：大模型从论文原文写出讲解脚本（8–12 个镜头），再为每个镜头写一段 Remotion 动画代码，按所选视频风格渲染成 16:9 视频，配中英双语字幕、背景音乐和可选旁白。
6. **通知**：把新解读、新月报和运行失败推送到订阅了对应事件的渠道。

每月 1 日另有一个定时计划，汇总上个月的解读生成**趋势月报**。

## 目录

```
apps/web       Next.js：前台阅读 + /admin 后台
apps/worker    常驻进程：按后台的定时计划发起运行，串行执行运行队列
packages/core  数据库（SQLite + Drizzle）、大模型适配（Anthropic / OpenAI 兼容 / ChatGPT 订阅）、流水线
packages/video Remotion 视频工程：讲解脚本 schema、镜头组件库、运行时、渲染、音乐合成
data/          运行数据：app.db、论文原图、视频、音乐
```

## 本地开发

需要 Node.js 22 及以上。

```bash
npm install
cp .env.example .env          # 至少修改 ADMIN_PASSWORD 和 SESSION_SECRET
npm run dev:web               # http://localhost:3000
npm run dev:worker            # 另开一个终端
```

登录后台的步骤：
1. 在「模型」页添加一个大模型并点「测试连接」。
   - 按量 API：选服务商模板，填 API Key。
   - 订阅套餐：选「ChatGPT 订阅（Codex）」后用设备码登录 ChatGPT 账号（服务器上也能用），或导入本机 Codex CLI 的 `~/.codex/auth.json`；令牌会自动刷新。各家 Coding Plan 填套餐专属 Key 即可。
2. 在「模型」页的工作流区选择默认模型并保存。选题、解读、讲解脚本、动画代码、月报默认共用它，也可分别覆盖；备用模型只使用明确指定的项。未确认默认模型前，定时计划不会启动模型运行。
3. 在「概览」页点「开始运行」。模型设置会在运行开始时固定，之后的修改仅用于下一次运行。

服务商目录与接口格式（Anthropic、Chat Completions、Responses、Gemini 原生）来自 CC Switch，适配范围见 [CC Switch 适配说明](docs/third-party/cc-switch.md)。

国内本地开发访问 huggingface.co 不稳定，可以在 `.env` 里设置 `HF_ENDPOINT=https://hf-mirror.com`，或者配置 `HTTPS_PROXY`。

命令行手动运行：

```bash
npm run run-once -w @paper/worker                       # 按当前配置自动选题
npm run run-once -w @paper/worker -- 2610.22200         # 直接解读指定论文
npm run run-once -w @paper/worker -- --video 1          # 只重做解读 #1 的视频
npm run run-once -w @paper/worker -- --report 2026-10   # 生成指定月份的月报
npm run studio -w @paper/video                          # Remotion Studio 预览视频框架
npm run check                                           # 全部类型检查 + 全部单元测试
```

修改 `packages/core/src/db/schema.ts` 后，运行 `npm run db:generate` 生成迁移。web 和 worker 启动时会自动执行迁移。

## 部署到服务器

推荐配置：海外或香港节点，2 核 4GB 内存以上（视频渲染比较耗资源），已安装 Docker。

```bash
git clone <仓库> paper-web && cd paper-web
cp .env.example .env
# 编辑 .env：
#   ADMIN_PASSWORD / SESSION_SECRET  必改
#   SITE_URL=https://你的域名        通知里的链接会用到
#   SMTP_*                           可选：邮件渠道未填发信服务器时使用
docker compose build
docker compose up -d
docker compose logs -f worker     # 查看定时计划与运行日志
```

web 服务只监听 `127.0.0.1:3000`，对外访问需要加一层反向代理并配置 HTTPS，例如 Caddy：

```
你的域名 {
  reverse_proxy 127.0.0.1:3000
}
```

数据全部存放在 `./data`，备份这个目录即可。

### 环境变量

| 变量 | 说明 |
|---|---|
| `ADMIN_PASSWORD` | 登录密码（前台、后台共用） |
| `SESSION_SECRET` | 会话加密密钥，至少 32 个字符 |
| `SITE_URL` | 站点公网地址，用于通知中的链接 |
| `DATA_DIR` | 数据目录，默认 `./data` |
| `HF_ENDPOINT` | Hugging Face 地址，默认 `https://huggingface.co` |
| `HTTPS_PROXY` | 可选，出网代理 |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | 邮件渠道的默认发信服务器（也可在后台渠道里填写） |
| `RENDER_CONCURRENCY` | 视频渲染并发数，默认由 Remotion 决定 |
| `REMOTION_BROWSER` | 可选，指定 Chrome 可执行文件路径 |

## 后台能配置什么

- **定时计划**：论文精选（每周哪几天、几点、推荐几篇）与趋势月报（每月几号、几点），修改后 30 秒内生效。
- **提示词**：「提示词助手」听你描述产出哪里不满意，参考近期产出和收藏 / 不感兴趣给出修改后的写作要求（按行显示差异），一键保存为新版本。每个环节的写作要求按版本保存，启用前可用一篇已有论文或某个月份「试写」，与当前产出并排对比后再启用；运行开始时锁定所用版本。重新解读会保留旧修订，可在解读预览里对比并切换生效的一版。
- **选题与方向**：每个关注方向显示一句话描述和近期命中的论文；「方向助手」用大白话对话生成方向草稿，先看近期会命中哪些论文再保存。收藏与不感兴趣会作为偏好样例交给选题精选。参数页只保留论文来源与新旧论文比例，其余放在「高级」。
- **模型**：可以添加多个服务商与模型（Anthropic、OpenAI 兼容、Responses、Gemini、ChatGPT 订阅）。选题精选、论文解读、讲解脚本、动画代码、趋势月报和对话（助手与追问）六个环节可以分别覆盖全局默认与备用模型。
- **视频**：风格库（内置深色科技、学术幻灯片、数学动画、科技快讯、白板手绘，可新建、复制、停用，每个风格可生成约 20 秒样片；也可「从参考视频生成」：上传不超过 10 分钟、200MB 的视频，worker 抽关键帧交给能看图的对话模型提炼风格，生成停用中的新风格和样片，确认后启用，原视频分析完即删除）；生成设置里选择自动挑风格或固定风格、旁白（OpenAI 兼容服务商的语音合成）、背景音乐与曲库。解读详情的「视频」页签可编辑讲解脚本、让 AI 改单个镜头，再「重新生成视频」只重写改过的镜头。白板手绘的手写字体需要渲染机器装有霞鹜文楷等字体，否则退回普通字体。
- **通知**：飞书、企业微信、钉钉群机器人（支持加签）、邮件（可直接填写 SMTP）；每个渠道选择接收哪些事件，可保存并发送测试消息。
- **阅读站**：阅读站采用暖灰画布、白色内容面、深墨色文字与炭蓝操作色，标题使用自托管中文宋体，正文使用中文无衬线字体。首页独立采用白色主调、大字分栏与错落论文预览，下方展开月报与方向；支持论文原图与视频切换、按需展开阅读提要；论文库、视频、方向、月报与归档共享排版规则。论文和月报共用阅读工作台，阅读页取消顶部浮动导航、保留文章标题，桌面默认左侧目录展开；论文开篇保留入选理由和视频，正文最大 760px。目录紧贴正文左侧，宽阅读区正文居中；助手、笔记与论文／月报信息按钮悬浮在支持左／右停靠、浮动及全屏的面板内，内容不预留按钮整列空间，仅输入框避让。面板从右下角以 360ms 弹性展开、260ms 收回，另有返回顶部按钮；同期原论文归入论文信息。笔记直接编辑已渲染的 Markdown、公式、表格与代码，提供可编辑源码入口，各篇论文与各期月报的笔记和会话独立保存；停靠可拖分隔线调宽，浮窗可移动和八方向缩放。停靠重排时保持当前阅读内容，切换或关闭保留草稿及进行中请求，浏览器仅记住窗口尺寸，每次重新打开默认右侧停靠，不恢复上次模式或位置。论文库保留研究方向与时间排序，已移除搜索、收藏、阅读状态和不感兴趣入口，不再持久化记录阅读进度。历史标记保留，但不再隐藏前台论文。视觉规范见 `apps/web/DESIGN.md`。
- **内容管理**：解读按标签、月份筛选并分页，可批量重新解读、重做视频或删除（删除后该论文不再推荐）；月报可查看与重做。

## 浏览器回归

不调用真实模型，均使用项目已有的 Chrome Headless Shell：

- **阅读操作面板**：`npm run check:reader` 自动启动独立测试服务（默认 3106，可用 `READER_TEST_PORT` 调整）和本地模拟模型，测试停靠、浮动、全屏、拖拽缩放、阅读位置、会话与笔记。使用 `data/reader-panel-fixture-*` 中的独立数据库及截图，只从主库读取公开阅读内容，不复制凭据或个人笔记。`npm test -w @paper/web` 覆盖正文渲染、窗口边界和偏好恢复。

- **模型界面**：先生产构建，再以独立数据库启动测试服务；脚本会重置该 fixture 库的模型数据，主数据目录不受影响。

  ```powershell
  $env:DATA_DIR='data/ui-policy-fixture'; $env:HTTPS_PROXY=''; $env:HTTP_PROXY=''
  npm run start -w @paper/web -- -p 3101
  ```

  另一终端运行 `npx tsx scripts/check-model-ui.ts`。同一测试服务还可运行 `scripts/check-model-layout.ts`（服务商目录与图标）和 `scripts/check-cc-switch-ui.ts`（接入参数与批量添加）。
- **布局**：对本地 3000 服务运行 `node --experimental-strip-types scripts/check-layout.ts`（只读交互）。
- **截图**：`npx tsx scripts/screenshot.ts /admin /admin/models`，输出到 `SHOT_DIR`（默认 `/tmp/shots`）。

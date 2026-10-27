# 论文web · AI 前沿论文精读

自动追踪 AI 前沿：定时挑选最值得读的论文，生成层层递进的中文解读和带双语字幕的讲解视频，每月汇总成趋势月报，并推送到邮箱、飞书、企业微信或钉钉。

领域术语见 [GLOSSARY.md](GLOSSARY.md)，关键设计决策见 [docs/adr/](docs/adr/)。

## 工作流程

一次**运行**的步骤如下：

1. **采集**：从 HF Daily Papers（带社区点赞数）和 arXiv（按你关注的方向分类）拉取近 N 天的新论文。抽中"近期重要论文"名额时，再从 Semantic Scholar 拉取近几个月的高引论文。
2. **初筛**：按热度、主题关键词和头部机构打一个规则分，去掉已经推荐过的论文，取前 20 篇左右。
3. **精选**：大模型阅读候选的标题和摘要，选出推荐论文和 2–3 篇备选。
4. **解读**：读取 arXiv HTML 全文和原图（没有 HTML 版本时退回 PDF），写出 8 段式解读。"趋势定位"一节会联系历史推荐。
5. **视频**：大模型把解读改写成结构化分镜，再由 Remotion 渲染成 16:9 视频，配中英双语字幕和背景音乐（程序化合成或曲库）。
6. **通知**：把新解读、新月报和运行失败推送到订阅了对应事件的渠道。

每月 1 日另有一个定时计划，汇总上个月的解读生成**趋势月报**。

## 目录

```
apps/web       Next.js：前台阅读 + /admin 后台
apps/worker    常驻进程：按后台的定时计划发起运行，串行执行运行队列
packages/core  数据库（SQLite + Drizzle）、大模型适配（Anthropic / OpenAI 兼容 / ChatGPT 订阅）、流水线
packages/video Remotion 视频工程：分镜 schema、场景组件、渲染、音乐合成
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
2. 在「模型」页的工作流区选择默认模型并保存。选题、解读、分镜、月报默认共用它，也可分别覆盖；备用模型只使用明确指定的项。未确认默认模型前，定时计划不会启动模型运行。
3. 在「概览」页点「开始运行」。模型设置会在运行开始时固定，之后的修改仅用于下一次运行。

服务商目录与接口格式（Anthropic、Chat Completions、Responses、Gemini 原生）来自 CC Switch，适配范围见 [CC Switch 适配说明](docs/third-party/cc-switch.md)。

国内本地开发访问 huggingface.co 不稳定，可以在 `.env` 里设置 `HF_ENDPOINT=https://hf-mirror.com`，或者配置 `HTTPS_PROXY`。

命令行手动运行：

```bash
npm run run-once -w @paper/worker                       # 按当前配置自动选题
npm run run-once -w @paper/worker -- 2610.22200         # 直接解读指定论文
npm run run-once -w @paper/worker -- --video 1          # 只重做解读 #1 的视频
npm run run-once -w @paper/worker -- --report 2026-10   # 生成指定月份的月报
npm run studio -w @paper/video                          # Remotion Studio 预览视频模板
npm test && npm test -w @paper/video
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
- **选题与方向**：关注方向（arXiv 分类、关键词、权重）、论文来源、回看天数、近期重要论文比例、备选篇数、头部机构列表。
- **模型**：可以添加多个服务商与模型（Anthropic、OpenAI 兼容、Responses、Gemini、ChatGPT 订阅）。选题精选、论文解读、视频分镜、趋势月报四个环节可以分别覆盖全局默认与备用模型。
- **视频**：开关自动生成、音乐模式（程序化合成、曲库、无）、音量、字幕阅读速度、上传曲库、合成音乐试听。
- **通知**：飞书、企业微信、钉钉群机器人（支持加签）、邮件（可直接填写 SMTP）；每个渠道选择接收哪些事件，可保存并发送测试消息。
- **解读管理**：上线或下线、重新解读、重做视频。

## 浏览器回归

不调用真实模型，均使用项目已有的 Chrome Headless Shell：

- **模型界面**：先生产构建，再以独立数据库启动测试服务；脚本会重置该 fixture 库的模型数据，主数据目录不受影响。

  ```powershell
  $env:DATA_DIR='data/ui-policy-fixture'; $env:HTTPS_PROXY=''; $env:HTTP_PROXY=''
  npm run start -w @paper/web -- -p 3101
  ```

  另一终端运行 `npx tsx scripts/check-model-ui.ts`。同一测试服务还可运行 `scripts/check-model-layout.ts`（服务商目录与图标）和 `scripts/check-cc-switch-ui.ts`（接入参数与批量添加）。
- **布局**：对本地 3000 服务运行 `node --experimental-strip-types scripts/check-layout.ts`（只读交互）。
- **截图**：`npx tsx scripts/screenshot.ts /admin /admin/models`，输出到 `SHOT_DIR`（默认 `/tmp/shots`）。

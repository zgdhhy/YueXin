# CC Switch 参考与适配范围

本次核对日期：2026-10-26。参考官方仓库最新 `main`，package.json 版本 **4.0.20**，固定提交 [`e8e1cfbff4f2d93f2d6c4ba4ad10b511e012c733`](https://github.com/farion1231/cc-switch/tree/e8e1cfbff4f2d93f2d6c4ba4ad10b511e012c733)。此前参考版本为 v4.0.18 / `cb90a24`。

## 参考源码

- `src/config/{claude,codex,gemini}ProviderPresets.ts`：服务商地址、模型目录、套餐与地区、API 格式。
- `src/config/presetFamilies.ts`：按厂商合并展示套餐和地区变体。
- `src/components/providers/forms/{ProviderPresetSelector,ProviderForm,RequestHeadersEditor}.tsx`：模板、结构化连接配置、请求头分离。
- `src/components/providers/forms/shared/FullUrlToggle.tsx`：完整 URL 模式。
- `src/types.ts` 的 `ProviderMeta`：`apiFormat`、`apiKeyField`、`isFullUrl`、`customUserAgent` 等连接属性。
- `src-tauri/src/proxy/providers/codex.rs`：端点族和 wire-api 识别。HTTP/SDK 适配为本项目独立实现，不引入 Rust 桌面代理。

## 已移植

| 能力 | 本项目实现 |
| --- | --- |
| 服务商与套餐预设 | 从三份上游预设整理 295 个可直接配置 API 的变体；与 19 个已有模板按协议/地址合并后共 309 个模板，115 个厂商组。保留旧模板 ID，不覆盖现有连接 |
| 厂商、套餐、地区分组 | 厂商选择后再选具体套餐/地区/API 格式，支持名称及推荐模型搜索 |
| 请求格式 | Anthropic Messages、OpenAI Chat Completions、OpenAI Responses、Gemini 原生 generateContent；ChatGPT Codex 订阅沿用独立 OAuth 路径 |
| 接入参数 | Base URL / 完整端点、独立 models URL、超时、Bearer / x-api-key / x-goog-api-key / 自定义头 / 免认证 |
| 模型配置 | 显示名、实际请求 ID 映射、上下文窗口记录、输出预算、价格、按协议选择思考参数；Chat 接口支持选择 max_tokens 或 max_completion_tokens |
| 模型发现 | 通用模型列表、Gemini 模型前缀与分页、输出/上下文能力元数据；单独列表地址不再向其他候选主机尝试 |
| 批量添加 | 一行一个或逗号分隔，最多200个，去重保存；不自动测试、不修改默认模型 |
| 凭据保护 | 请求头值只存服务端，浏览器只获知头名称；请求日志与错误脱敏；运行快照去除头值，执行时读取最新凭据 |

模板是上游配置数据，不等于所有端点已用真实账户验证。原有未配置的默认模型不会被推断；旧服务商、密钥、账号和工作流分配均保留。所有新格式均已用模拟响应验证，请在模型列表里按需进行真实连接测试。

配置导入（CC Switch / Claude / Gemini JSON、Codex TOML）已于 2026-10-27 移除，服务商通过「添加服务商」目录手动接入。

**不移植桌面专属能力**：CLI 配置文件写回、系统钥匙串、启动命令、MCP/技能/钩子、订阅账号托管数据库、完整代理/聚合路由、用量脚本、Bedrock SigV4、Vertex 身份认证。本项目目前只提供原有 ChatGPT 订阅登录；不将 Claude 官方、Google 官方、Copilot、xAI 等桌面 OAuth 入口伪装成 API Key 模板。

## 更新与验证

源码副本位于本地忽略目录 `data/upstream-cc-switch-20261026`。更新模板：

```bash
node scripts/sync-cc-switch-presets.mjs data/upstream-cc-switch-20261026
```

生成文件：`packages/core/src/llm/cc-switch-presets.ts`，附固定提交与 MIT 来源。去掉推广参数、赞助排序和模板内的桌面设置；同步报告位于 `data/cc-switch-port-report.json`。

- `npm test -w @paper/core`：协议请求、模型映射、headers/快照/错误脱敏与分页。
- `npm run typecheck`：全部工作区。
- `node --experimental-strip-types scripts/check-model-ui.ts`：原有模型工作流、草稿、授权与慢网回归。
- `node --experimental-strip-types scripts/check-cc-switch-ui.ts`：新增接入参数、批量添加与桌面/手机抽屉。
- `node --experimental-strip-types scripts/check-model-layout.ts`：服务商目录、图标与多宽度布局。

三套 UI 测试均要求独立的 `DATA_DIR=data/ui-policy-fixture` 测试服务运行于 3101 端口（可设 `NEXT_DIST_DIR` 隔离构建目录），模型请求只访问本地模拟接口。

上游 MIT 许可全文保留于 [CC-Switch-LICENSE.txt](CC-Switch-LICENSE.txt)。

## 品牌图标

124 个本地品牌图标通过 `packages/core/src/llm/icon-assets.ts` 注册，支持 SVG 与 PNG/JPG。编辑连接可选择图标或恢复自动识别；缺少图标时显示名称首字母。品牌资源来自 CC Switch 和已有 LobeHub 图标，许可位于 `apps/web/public/llm-icons/LICENSE.txt`。本站书页图标是独立 SVG。

资源更新顺序：

```bash
node scripts/sync-provider-icons.mjs data/upstream-cc-switch-20261026
node scripts/sync-cc-switch-presets.mjs data/upstream-cc-switch-20261026
```

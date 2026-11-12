# 开发与测试

代码结构与约定见 [AGENTS.md](../AGENTS.md)。

```bash
npm run check          # 全部类型检查 + 单元测试，改完先跑它
npm run db:generate    # 改 packages/core/src/db/schema.ts 后生成迁移；web 和 worker 启动时自动执行迁移
npm run studio -w @paper/video   # Remotion Studio 预览视频框架
```

## 浏览器回归

不调用真实模型，均使用 worker 目录下 Remotion 的 Chrome Headless Shell（第一次渲染视频时自动下载，也可在 `apps/worker` 下运行 `npx remotion browser ensure`）：

- **阅读操作面板**：`npm run check:reader` 自动启动独立测试服务（默认 3106，可用 `READER_TEST_PORT` 调整）和本地模拟模型，测试停靠、浮动、全屏、拖拽缩放、阅读位置、会话与笔记。使用 `data/reader-panel-fixture-*` 中的独立数据库及截图，只从主库读取公开阅读内容，不复制凭据或个人笔记。`npm test -w @paper/web` 覆盖正文渲染、窗口边界和偏好恢复。

- **模型界面**：先生产构建，再以独立数据库启动测试服务；脚本会重置该 fixture 库的模型数据，主数据目录不受影响。

  ```powershell
  $env:DATA_DIR='data/ui-policy-fixture'; $env:HTTPS_PROXY=''; $env:HTTP_PROXY=''
  npm run start -w @paper/web -- -p 3101
  ```

  另一终端运行 `npx tsx scripts/check-model-ui.ts`。同一测试服务还可运行 `scripts/check-model-layout.ts`（服务商目录与图标）和 `scripts/check-cc-switch-ui.ts`（接入参数与批量添加）。
- **布局**：对本地 3000 服务运行 `node --experimental-strip-types scripts/check-layout.ts`（只读交互）。
- **截图**：`npx tsx scripts/screenshot.ts /admin /admin/models`，输出到 `SHOT_DIR`（默认 `/tmp/shots`）。README 里的截图用它生成：`SHOT_VIEWPORT=1 SHOT_DIR=docs/images npx tsx scripts/screenshot.ts / /papers/<论文 ID>`。

FROM node:24-bookworm-slim

# Remotion 无头浏览器依赖 + 中文字体（视频字幕与界面用）
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
      libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
      fonts-noto-cjk fonts-noto-color-emoji ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/video/package.json packages/video/
RUN npm ci --include=dev

COPY . .
# 预下载 Remotion 用的 Chrome Headless Shell（缓存位置取决于工作目录，worker 在 apps/worker 下运行）
RUN cd apps/worker && npx remotion browser ensure
RUN npm run build -w @paper/web

VOLUME /app/data
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@paper/web"]

# Build stage
FROM node:20-slim AS builder

# better-sqlite3 需要原生編譯工具
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 複製並安裝依賴
COPY package*.json ./
RUN npm ci --omit=dev

# 複製原始碼並編譯
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:20-slim AS production

# 安裝執行 better-sqlite3 所需的最低限度系統函式庫
RUN apt-get update && \
    apt-get install -y --no-install-recommends libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

# 建立非 root 使用者
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

WORKDIR /app

# 從 builder 階段複製必要檔案
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# 建立資料目錄並設定權限
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

# 切換到非 root 使用者
USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))" || exit 1

CMD ["node", "dist/index.js"]

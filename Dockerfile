FROM node:20-slim

# better-sqlite3 需要原生編譯工具
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先複製 package files 以利用 Docker layer cache
COPY package*.json ./

# 安裝生產依賴
RUN npm ci --omit=dev

# 複製原始碼和 TypeScript 設定
COPY tsconfig.json ./
COPY src/ ./src/

# 編譯 TypeScript
RUN npm run build

# 清理編譯工具以縮小映像大小
RUN apt-get purge -y python3 make g++ && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# 建立資料目錄
RUN mkdir -p /app/data

# 設定環境變數
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]

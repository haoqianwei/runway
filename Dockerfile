# Stage 1: Build server & web (uses built-in node:sqlite, zero native C++ compilation!)
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.server.json tsconfig.web.json vite.config.ts tailwind.config.js postcss.config.js ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

# Stage 2: Minimal production runtime
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data/downloads

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist/server/index.js"]

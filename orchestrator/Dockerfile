FROM node:20-alpine AS builder
WORKDIR /app

# Orchestrator deps
COPY orchestrator/package*.json ./
COPY orchestrator/tsconfig.json ./

# Prisma schema from repo root (single source of truth)
COPY prisma ./prisma

RUN npm install
RUN npx prisma generate

# Orchestrator source
COPY orchestrator/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

# Prisma runtime artifacts (generated client lives in .prisma)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# App build
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]

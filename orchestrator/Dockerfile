FROM node:20-alpine AS builder
WORKDIR /app

COPY orchestrator/package*.json ./
COPY orchestrator/tsconfig.json ./
COPY prisma ./prisma

RUN npm install
RUN npx prisma generate

COPY orchestrator/src ./src
RUN npm run build


FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app ./

RUN npm prune --omit=dev

CMD ["node", "dist/index.js"]

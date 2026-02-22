# worker/Dockerfile
# Production container for Aura worker (ECS-ready)
# IMPORTANT: this Dockerfile must be built with repo root as context:
#   docker build -f worker/Dockerfile .

FROM node:20-bookworm-slim AS deps
WORKDIR /app/worker

# Install dependencies (cached layer)
COPY worker/package.json worker/package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/worker

# Bring in node_modules from deps stage
COPY --from=deps /app/worker/node_modules ./node_modules

# Copy worker source
COPY worker/ ./

# Copy Prisma schema from repo root into the worker image
COPY prisma/ ./prisma/

# ✅ Generate Prisma client from the correct schema BEFORE build
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build the worker
RUN npm run build

FROM node:20-bookworm-slim AS run
WORKDIR /app/worker
ENV NODE_ENV=production

COPY --from=build /app/worker/package.json ./package.json
COPY --from=build /app/worker/node_modules ./node_modules
COPY --from=build /app/worker/dist ./dist
COPY --from=build /app/worker/prisma ./prisma

CMD ["node", "dist/index.js"]

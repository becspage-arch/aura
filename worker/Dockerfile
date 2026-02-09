# worker/Dockerfile
# Production container for Aura worker (ECS-ready)

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Install dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Bring in node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the worker source
COPY . .

# If Prisma is used, generate the client during build
# (Safe even if Prisma isn't used, but will fail if prisma isn't installed.)
RUN npm run build && npx prisma generate

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production

# Copy built output + runtime deps
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# If your runtime needs prisma schema at runtime, include it
COPY --from=build /app/prisma ./prisma

# Run the compiled worker
CMD ["node", "dist/index.js"]

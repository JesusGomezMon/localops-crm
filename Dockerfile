# syntax=docker/dockerfile:1

# Multi-stage build on Node 20 (alpine).
#
# `builder` is kept as an addressable stage on purpose: docker-compose runs database
# migrations from it, because the `runner` stage ships Next's standalone output and
# deliberately does not carry the Prisma CLI.

# ---- deps -------------------------------------------------------------------
FROM node:20-alpine AS deps
# openssl + libc6-compat are what Prisma's query engine needs on musl.
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm@11.9.0

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
# postinstall runs `prisma generate`, which needs the schema copied above.
RUN pnpm install --frozen-lockfile

# ---- builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm@11.9.0

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders. Next evaluates modules while compiling, and Prisma wants a
# URL present at import. Nothing here reaches the runtime image.
ENV DATABASE_URL="file:./build.db"
ENV AUTH_SECRET="build-time-placeholder"
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ---- runner -----------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next's standalone bundle carries only the modules actually traced as reachable.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The SQLite file lives on a volume shared with the migrate service. Creating it here
# with the right ownership means the named volume inherits it, so the unprivileged
# user below can actually write.
RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3000

CMD ["node", "server.js"]

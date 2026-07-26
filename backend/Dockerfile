# ═══════════════════════════════════════════════════════════════
# Backend Dockerfile - NestJS Multi-Vendor Marketplace
# ═══════════════════════════════════════════════════════════════

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm for faster builds
RUN corepack enable pnpm

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build application
RUN pnpm run build

# ═══════════════════════════════════════════════════════════════
# Production stage
# ═══════════════════════════════════════════════════════════════

FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Set NODE_ENV
ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/
RUN pnpm install --prod --frozen-lockfile

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Generate Prisma Client for production
RUN npx prisma generate

# Create uploads and logs directories
RUN mkdir -p uploads logs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]

# ═══════════════════════════════════════════════════════════════
# Development stage (optional - for local dev with Docker)
# ═══════════════════════════════════════════════════════════════

FROM node:20-alpine AS development

WORKDIR /app

RUN corepack enable pnpm

COPY package*.json ./
COPY prisma ./prisma/

RUN pnpm install

COPY . .

RUN npx prisma generate

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate dev && pnpm run start:dev"]

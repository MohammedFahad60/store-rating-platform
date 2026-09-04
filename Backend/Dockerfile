# Production Dockerfile for STORE API — Node 22 + MySQL 8 (mysql2)
# Used by Railway, Fly.io, AWS ECS/EC2, or any Docker host.
# The image never runs `npm run seed` automatically — seed is manual.

FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts=false

# Copy source
COPY . .

# Health check uses the same endpoint as Render/Railway/AWS
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-5000}/api/health || exit 1

EXPOSE 5000

# Production startup: verify schema, then listen. Never auto-migrates schema
# (run `npm run db:migrate` as a one-shot job before first deploy).
ENV NODE_ENV=production
CMD ["node", "server.js"]

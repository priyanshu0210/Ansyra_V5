# ── Ansyra self-hosted image ───────────────────────────────────────────────
# Deploy anywhere: a VPS, Railway, Fly.io, Render, or your own Kubernetes.
# No Vercel / Emergent lock-in. Zero code changes required.
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps (leveraging Docker cache)
COPY package.json package-lock.json* yarn.lock* ./
RUN npm ci --ignore-scripts

# Optional public contact address only; never pass credentials as VITE_* args.
ARG VITE_PUBLIC_CONTACT_EMAIL

# Build the whole app (Vite frontend + Hono server bundle)
COPY . .
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies in the final image. This avoids copying
# the builder's compilers, test runners, browsers, and Supabase CLI.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy only what we need to run.
COPY --from=builder /app/dist ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
USER node
CMD ["node", "dist/boot.js"]

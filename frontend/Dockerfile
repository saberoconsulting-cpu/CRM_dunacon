# ---- Etapa 1: dependencias y build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY next.config.js postcss.config.js tailwind.config.js tsconfig.json ./
COPY types ./types
COPY public ./public
COPY src ./src

ARG NEXT_PUBLIC_API=
ENV NEXT_PUBLIC_API=$NEXT_PUBLIC_API

RUN npm run build
RUN npm prune --omit=dev

# ---- Etapa 2: runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

CMD ["npm", "run", "start"]

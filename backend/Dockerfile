# ---- Etapa 1: dependencias y build ----
FROM node:20-alpine AS builder
WORKDIR /app

# Instalar solo package*.json para cachear
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Compilar TypeScript a dist
RUN npm run build

# Limpiar dependencias para una instalación de solo producción
RUN npm prune --omit=dev

# ---- Etapa 2: runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copiamos de la fase builder los artefactos mínimos
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Directorio para subir planos/portadas (local)
RUN mkdir -p /app/uploads/plans /app/uploads/covers

EXPOSE 3001

CMD ["node", "dist/main"]

# Se monta volumen para persistir archivos subidos
VOLUME ["/app/uploads"]

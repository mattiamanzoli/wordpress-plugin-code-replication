# === Build ===
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# === Runtime ===
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# utente non-root (buona pratica)
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
# copia l'output "standalone" e gli asset
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER 1001
EXPOSE 8080
# avvia il server "standalone" di Next
CMD ["node", "server.js"]

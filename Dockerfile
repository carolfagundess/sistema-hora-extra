FROM node:22-alpine

# sqlite3 (CLI) e usado so para backups manuais/administrativos
# (docker compose exec app sqlite3 ...); o app em si usa o modulo nativo
# node:sqlite, que nao depende deste pacote.
RUN apk add --no-cache sqlite

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY views ./views
COPY public ./public
COPY migrations ./migrations
COPY scripts ./scripts
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV DB_PATH=/data/dados.sqlite
ENV PORT=3000

EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]

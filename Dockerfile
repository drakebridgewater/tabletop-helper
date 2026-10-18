# No dependencies to install: the server uses only Node's standard library,
# including the built-in SQLite driver (node:sqlite).
FROM node:24-alpine
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_FILE=/data/tabletop.sqlite \
    NODE_NO_WARNINGS=1
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
# Runs as any uid (Unraid uses 99:100); only /data must be writable.
RUN mkdir -p /data && chmod 777 /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "server/index.js"]

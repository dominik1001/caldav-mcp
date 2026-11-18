# Runs caldav-mcp with the Streamable HTTP transport (--http).
# MCP_AUTH_TOKEN is required: the container listens on all interfaces.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts skips `prepare` (lefthook), which the image doesn't need.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
# No MCP_PORT here: the server defaults to 3000 and falls back to PORT,
# which platforms like Cloud Run and Heroku set.
ENV NODE_ENV=production \
    MCP_HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${MCP_PORT:-${PORT:-3000}}/health" || exit 1
ENTRYPOINT ["node", "dist/index.js", "--http"]

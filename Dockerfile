FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build && npm prune --omit=dev

ENV PORT=3000
ENV LISTEN_ADDR=0.0.0.0
EXPOSE 3000

CMD ["node", "dist/index.js", "--http"]

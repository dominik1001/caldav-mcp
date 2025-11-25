FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build && npm prune --production

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js", "--http"]

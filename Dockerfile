FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-fund --no-audit

COPY server ./server
COPY public ./public

ENV PORT=8080
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data

EXPOSE 8080

CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]

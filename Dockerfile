FROM node:22-alpine

WORKDIR /app

COPY site/package.json site/package-lock.json ./
RUN npm ci

COPY site/ .
RUN npx @11ty/eleventy

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]

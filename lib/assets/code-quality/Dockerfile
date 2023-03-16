FROM --platform=linux/amd64 node:16.19-bullseye-slim AS base

RUN apt-get update \
  && apt-get install -y git tini \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data/app \
  && chown -R node:node /data/app \
  && chmod -R 700 /data/app

RUN mkdir -p /usr/app \
  && chown -R node:node /usr/app \
  && chmod -R 700 /usr/app

WORKDIR /usr/app

USER node

COPY --chown=node:node package*.json ./
RUN npm install

COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.json ./

RUN npm run build

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/index.js"]
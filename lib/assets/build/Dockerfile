FROM --platform=linux/amd64 docker:dind AS base

# Install node
RUN apk add --no-cache nodejs npm

RUN apt-get update \
  && apt-get install -y git tini \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data/app \
  && chown -R node:node /data/app \
  && chmod 700 /data/app

RUN mkdir -p /usr/app \
  && chown -R node:node /usr/app \
  && chmod 700 /usr/app

WORKDIR /usr/app

USER node

COPY --chown=node:node package*.json ./
RUN npm install

COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.json ./

RUN npm run build

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/index.js"]
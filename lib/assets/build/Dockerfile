FROM --platform=linux/amd64 docker:dind AS base

RUN apk add --no-cache \
    nodejs \
    npm \
    git \
    tini

RUN mkdir -p /data/app

RUN mkdir -p /usr/app

WORKDIR /usr/app

USER root

COPY package*.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./

RUN npm run build

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/index.js"]
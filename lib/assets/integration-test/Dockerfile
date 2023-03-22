FROM --platform=linux/amd64 docker:dind AS base

RUN apk add --no-cache \
    nodejs \
    npm \
    git \
    tini

# Assumes docker-compose.yml is stored in GitHub repo root, and cloned with the rest of the repo
RUN mkdir -p /data/app

RUN mkdir -p /usr/app

WORKDIR /usr/app

USER root

COPY package*.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./

RUN npm run build

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "./dist/index.js"]
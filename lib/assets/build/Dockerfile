FROM --platform=linux/amd64 bentolor/docker-dind-awscli
RUN apk add --no-cache nodejs npm
COPY . /
RUN npm config set fetch-retry-mintimeout 20000
RUN npm config set fetch-retry-maxtimeout 120000
RUN npm ci
RUN npm run build
CMD node /dist/index.js
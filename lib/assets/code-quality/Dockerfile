FROM --platform=linux/amd64 node:18
COPY . /
RUN npm ci
RUN npm run build
CMD node /dist/index.js
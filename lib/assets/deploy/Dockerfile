FROM --platform=linux/amd64 node
COPY . /
RUN npm ci
RUN npm run build
CMD node /dist/deploy.js
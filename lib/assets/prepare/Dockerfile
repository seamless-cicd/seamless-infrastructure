# Pin to slim debian distro
FROM --platform=linux/amd64 node:16.19-bullseye-slim AS base

# Install git, and tini for better Linux Kernel signal handling
RUN apt-get update \
  && apt-get install -y git tini \
  && rm -rf /var/lib/apt/lists/*

# /data/app is the mounted shared Docker volume on EFS
# Use non-root user "node" (included in the official node images)
# Grant user permission to remove existing source code if needed
RUN mkdir -p /data/app \
  && chown -R node:node /data/app \
  && chmod 700 /data/app

# /usr/app is where the Seamless Prepare Stage executor script is stored
RUN mkdir -p /usr/app \
  && chown -R node:node /usr/app \
  && chmod 700 /usr/app

WORKDIR /usr/app

USER node

# Install dependencies
COPY --chown=node:node package*.json ./
RUN npm install

# Copy only necessary files
COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.json ./

# Build TypeScript to JavaScript
RUN npm run build

# Run commands with tini
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/index.js"]
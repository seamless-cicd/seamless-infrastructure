FROM --platform=linux/amd64 node:18
USER root

# Install dumb-init
RUN apt-get update && apt-get install -y dumb-init

COPY commands.sh /
RUN chmod +x /commands.sh

# Prefix logs with pipeline stage id
ENTRYPOINT ["dumb-init", "--"]
CMD ["/bin/sh", "-c", "prefix=\"[${STAGE_ID}] \"; exec /commands.sh 2>&1 | sed -e \"s/^/${prefix}/\""]

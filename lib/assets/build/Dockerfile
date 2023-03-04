FROM --platform=linux/amd64 bentolor/docker-dind-awscli
USER root
COPY commands.sh /
ENTRYPOINT ["/bin/sh", "/commands.sh"]
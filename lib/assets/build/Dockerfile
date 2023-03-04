FROM docker

RUN apk update
RUN apk add aws-cli

COPY commands.sh /
CMD sh commands.sh
VOLUME [ "/data" ]
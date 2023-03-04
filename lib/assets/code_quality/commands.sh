#!/bin/sh

echo "running code quality analysis using '$LINT_COMMAND'"
cd /data/app
npm run lint
# eval "\"$LINT_COMMAND\""
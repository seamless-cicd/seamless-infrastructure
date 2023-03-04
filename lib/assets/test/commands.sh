#!/bin/sh

echo "running unit tests with '$TEST_COMMAND'"
cd /data/app
npm run test
# eval "\"$TEST_COMMAND\""
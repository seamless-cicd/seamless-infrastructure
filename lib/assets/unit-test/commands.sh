# If no source code is present, exit
if ! [ -d "/data/app" ]; then
    echo "Source code has not been cloned yet"
    exit 1
fi

# Check if a unit test command was provided
if [ -z "$UNIT_TEST_COMMAND" ]; then
    echo "Error: No unit test command provided"
    exit 1
fi

# Run unit tests
echo "Running unit tests with $UNIT_TEST_COMMAND"

cd /data/app
$UNIT_TEST_COMMAND

# Check the exit status of the unit tests
if [ $? -eq 0 ]; then
    echo "Unit tests passed"
else
    echo "Unit tests failed"
    exit 1
fi
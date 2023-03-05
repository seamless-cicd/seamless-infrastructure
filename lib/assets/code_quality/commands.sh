# If no source code is present, exit
if ! [ -d "/data/app" ]; then
    echo "Source code has not been cloned yet"
    exit 1
fi

# Run code quality commands
echo "Running code quality commands"

cd /data/app
if npm run lint; then
    echo "Code quality commands executed successfully"
else 
    echo "Code quality commands failed"
    exit 1
fi
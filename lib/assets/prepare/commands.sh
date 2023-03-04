# If repo was previously cloned, remove it
if [ -d "/data/app" ]; then
    echo "Deleting existing source code folder"
    rm -rf "/data/app"
    mkdir -p "/data/app"
fi

# Clone repository from GitHub using personal access token
echo "Cloning source code from $GH_REPO using $GH_PAT"

if git clone "$GH_REPO" "/data/app"; then
    echo "Cloning succeeded"
else
    echo "Cloning failed; deleting source code folder"
    rm -rf "/data/app"
    exit 1
fi

cd "/data/app"

# Install dependencies using npm
echo "Installing dependencies"

npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000

if npm ci; then
    echo "Installing dependencies succeeded"
else
    echo "Installing dependencies failed; deleting source code folder"
    rm -rf "/data/app"
    exit 1
fi
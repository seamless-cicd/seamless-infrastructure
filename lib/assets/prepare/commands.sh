echo "cloning from $GH_REPO using $GH_PAT"
rm -rf /data/app
mkdir -p /data/app

# TODO: Git pull if repository already exists?

echo "cloning"
git clone $GH_REPO /data/app
echo "done cloning"

cd /data/app

echo "installing"
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm install
echo "done installing"
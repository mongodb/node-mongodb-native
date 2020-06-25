NVM_DIR=/root/.nvm
DRIVER_REF=${1:-"master"}
NODE_LTS_NAME=${2:-"carbon"}

# Clone repo and check out appropriate ref
# Note - could add an option to allow a volume containing the src to be mounted, to allow testing of uncommitted code
git clone $GITHUB_REPO_URL
cd $GITHUB_REPO_NAME
git checkout $DRIVER_REF

# Install desired LTS version of Node
# Note - can extend this logic to support non-LTS versions of node, if desired
curl https://raw.githubusercontent.com/creationix/nvm/v0.35.3/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install --lts=$NODE_LTS_NAME \
    && npm install

# Run tests on each topology type
# single
MONGODB_URI="mongodb://${MONGODB_HOST}:27017" npm test
# replicaset
MONGODB_URI="mongodb://${MONGODB_HOST}:31000/?replicaSet=rs" npm test
# sharded
MONGODB_URI="mongodb://${MONGODB_HOST}:51000,${MONGODB_HOST}:51001/" npm test

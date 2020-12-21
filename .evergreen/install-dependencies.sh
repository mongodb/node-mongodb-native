#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

NVM_WINDOWS_URL="https://github.com/coreybutler/nvm-windows/releases/download/1.1.7/nvm-noinstall.zip"
NVM_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh"

NODE_LTS_NAME=${NODE_LTS_NAME:-carbon}
MSVS_VERSION=${MSVS_VERSION:-2017}
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
NPM_CACHE_DIR="${NODE_ARTIFACTS_PATH}/npm"
NPM_TMP_DIR="${NODE_ARTIFACTS_PATH}/tmp"

# this needs to be explicitly exported for the nvm install below
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
export XDG_CONFIG_HOME=${NODE_ARTIFACTS_PATH}

# create node artifacts path if needed
mkdir -p ${NODE_ARTIFACTS_PATH}
mkdir -p ${NPM_CACHE_DIR}
mkdir -p "${NPM_TMP_DIR}"

case $NODE_LTS_NAME in
  "argon")
    VERSION=4
    ;;
  "boron")
    VERSION=6
    ;;
  "carbon")
    VERSION=8
    ;;
  "dubnium")
    VERSION=10
    ;;
  "erbium")
    VERSION=12
    ;;
  "fermium")
    VERSION=14
    ;;
  *)
    echo "Unsupported Node LTS version $1"
    exit 1
    ;;
esac
NODE_VERSION=$(curl --retry 8 --retry-delay 5  --max-time 50 -s -o- \
  https://nodejs.org/download/release/latest-v${VERSION}.x/SHASUMS256.txt \
| head -n 1 | awk '{print $2};' | cut -d- -f2)
export NODE_VERSION=${NODE_VERSION:1}

# output node version to expansions file for use in subsequent scripts
cat <<EOT > deps-expansion.yml
  NODE_VERSION: "$NODE_VERSION"
EOT

# install Node.js on Windows
if [[ "$OS" == "Windows_NT" ]]; then
  # Delete pre-existing node to avoid version conflicts
  rm -rf "/cygdrive/c/Program Files/nodejs"

  export NVM_HOME=`cygpath -w "$NVM_DIR"`
  export NVM_SYMLINK=`cygpath -w "$NODE_ARTIFACTS_PATH/bin"`
  export NVM_ARTIFACTS_PATH=`cygpath -w "$NODE_ARTIFACTS_PATH/bin"`
  export PATH=`cygpath $NVM_SYMLINK`:`cygpath $NVM_HOME`:$PATH

  curl -L $NVM_WINDOWS_URL -o nvm.zip
  unzip -d $NVM_DIR nvm.zip
  rm nvm.zip

  chmod 777 $NVM_DIR
  chmod -R a+rx $NVM_DIR

  cat <<EOT > $NVM_DIR/settings.txt
root: $NVM_HOME
path: $NVM_SYMLINK
EOT
  nvm install $NODE_VERSION
  nvm use $NODE_VERSION
  which node || echo "node not found, PATH=$PATH"
  which npm || echo "npm not found, PATH=$PATH"
  npm config set msvs_version ${MSVS_VERSION}
  npm config set scripts-prepend-node-path true

# install Node.js on Linux/MacOS
else
  curl -o- $NVM_URL | bash
  [ -s "${NVM_DIR}/nvm.sh" ] && \. "${NVM_DIR}/nvm.sh"
  nvm install --no-progress $NODE_VERSION

  # setup npm cache in a local directory
  cat <<EOT > .npmrc
devdir=${NPM_CACHE_DIR}/.node-gyp
init-module=${NPM_CACHE_DIR}/.npm-init.js
cache=${NPM_CACHE_DIR}
tmp=${NPM_TMP_DIR}
registry=https://registry.npmjs.org
EOT
fi

# NOTE: registry was overridden to not use artifactory, remove the `registry` line when
#       BUILD-6774 is resolved.

# install node dependencies
npm install --unsafe-perm

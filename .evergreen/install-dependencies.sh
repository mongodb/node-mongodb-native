#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

NVM_WINDOWS_URL="https://github.com/coreybutler/nvm-windows/releases/download/1.1.7/nvm-noinstall.zip"
NVM_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh"

NODE_LTS_NAME=${NODE_LTS_NAME:-carbon}
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

node_lts_version () {
  case $1 in
    argon)
      VERSION=4
      ;;
    boron)
      VERSION=6
      ;;
    carbon)
      VERSION=8
      ;;
    dubnium)
      VERSION=10
      ;;
    erbium)
      VERSION=12
      ;;
    fermium)
      VERSION=14
      ;;
    *)
      echo "Unsupported Node LTS version $1"
      exit 1
      ;;
  esac
  NODE_VERSION=$(curl -s -o- https://nodejs.org/download/release/latest-v${VERSION}.x/SHASUMS256.txt \
  | head -n 1 | awk '{print $2};' | cut -d- -f2)
  export NODE_VERSION=${NODE_VERSION:1}
}

# install Node.js on Windows
if [[ $OS == "Windows_NT"|| $PLATFORM == "windows-64" ]]; then
  echo "--- Installing nvm on Windows ---"
  node_lts_version $NODE_LTS_NAME
  echo "NODE_VERSION=${NODE_VERSION}"

  export NVM_HOME=`cygpath -w "$NVM_DIR"`
  export NVM_SYMLINK=`cygpath -w "$NODE_ARTIFACTS_PATH/bin"`
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

# install Node.js on Linux/MacOS
else
  echo "--- Installing nvm on Linux/MacOS ---"
  curl -o- $NVM_URL | bash
  [ -s "${NVM_DIR}/nvm.sh" ] && \. "${NVM_DIR}/nvm.sh"
  nvm install --no-progress --lts=${NODE_LTS_NAME}

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

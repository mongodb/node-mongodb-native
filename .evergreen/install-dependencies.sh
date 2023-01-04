#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

NVM_WINDOWS_URL="https://github.com/coreybutler/nvm-windows/releases/download/1.1.9/nvm-noinstall.zip"
NVM_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh"

NODE_LTS_NAME=${NODE_LTS_NAME:-fermium}
MSVS_VERSION=${MSVS_VERSION:-2019}
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

function node_lts_to_version() {
  case $1 in
    "fermium")
      echo 14
      ;;
    "gallium")
      echo 16
      ;;
    "hydrogen")
      echo 18
      ;;
    "iron")
      echo 20
      ;;
    "latest")
      echo 'latest'
      ;;
    *)
      echo "Unsupported Node LTS version $1"
      ;;
  esac
}

function latest_version_for_node_major() {
  local __NODE_MAJOR_VERSION=$1
  local NODE_DOWNLOAD_URI="https://nodejs.org/download/release/latest-v${__NODE_MAJOR_VERSION}.x/SHASUMS256.txt"

  if [ $__NODE_MAJOR_VERSION == 'latest' ]
  then
    NODE_DOWNLOAD_URI="https://nodejs.org/download/release/latest/SHASUMS256.txt"
  fi

  # check that the requested version does exist
  curl --silent --fail $NODE_DOWNLOAD_URI &> /dev/null

  echo $(curl --retry 8 --retry-delay 5  --max-time 50 --silent -o- $NODE_DOWNLOAD_URI | head -n 1 | awk '{print $2};' | cut -d- -f2)
}

NODE_MAJOR_VERSION=$(node_lts_to_version $NODE_LTS_NAME)
NODE_VERSION=$(latest_version_for_node_major $NODE_MAJOR_VERSION)
NODE_VERSION=${NODE_VERSION:1} # :1 gets rid of the leading 'v'

echo "set version to $NODE_VERSION"

# output node version to expansions file for use in subsequent scripts
cat <<EOT > deps-expansion.yml
  NODE_VERSION: "$NODE_VERSION"
EOT

# install Node.js on Windows
if [[ "$OS" == "Windows_NT" ]]; then
  # Delete pre-existing node to avoid version conflicts
  rm -rf "/cygdrive/c/Program Files/nodejs"


  NVM_HOME=$(cygpath -w "$NVM_DIR")
  export NVM_HOME
  NVM_SYMLINK=$(cygpath -w "$NODE_ARTIFACTS_PATH/bin")
  export NVM_SYMLINK
  NVM_ARTIFACTS_PATH=$(cygpath -w "$NODE_ARTIFACTS_PATH/bin")
  export NVM_ARTIFACTS_PATH
  PATH=$(cygpath $NVM_SYMLINK):$(cygpath $NVM_HOME):$PATH
  export PATH

  curl -L $NVM_WINDOWS_URL -o nvm.zip
  unzip -d "$NVM_DIR" nvm.zip
  rm nvm.zip

  chmod 777 "$NVM_DIR"
  chmod -R a+rx "$NVM_DIR"

  cat <<EOT > "$NVM_DIR/settings.txt"
root: $NVM_HOME
path: $NVM_SYMLINK
EOT
  nvm install "$NODE_VERSION"
  nvm use "$NODE_VERSION"
  which node || echo "node not found, PATH=$PATH"
  which npm || echo "npm not found, PATH=$PATH"
  npm cache clear --force # Fixes: Cannot read properties of null (reading 'pickAlgorithm') error on windows
  npm config set msvs_version ${MSVS_VERSION}
  npm config set scripts-prepend-node-path true

# install Node.js on Linux/MacOS
else
  curl -o- $NVM_URL | bash
  [ -s "${NVM_DIR}/nvm.sh" ] && source "${NVM_DIR}/nvm.sh"
  nvm install --no-progress "$NODE_VERSION"

  # setup npm cache in a local directory
  cat <<EOT > .npmrc
devdir=${NPM_CACHE_DIR}/.node-gyp
init-module=${NPM_CACHE_DIR}/.npm-init.js
cache=${NPM_CACHE_DIR}
tmp=${NPM_TMP_DIR}
EOT
fi

npm install ${NPM_OPTIONS}

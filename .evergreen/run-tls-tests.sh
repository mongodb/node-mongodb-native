#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

export PROJECT_DIRECTORY="$(pwd)"
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
if [[ "$OS" == "Windows_NT" ]]; then
  export NVM_HOME=`cygpath -m -a "$NVM_DIR"`
  export NVM_SYMLINK=`cygpath -m -a "$NODE_ARTIFACTS_PATH/bin"`
  export NVM_ARTIFACTS_PATH=`cygpath -m -a "$NODE_ARTIFACTS_PATH/bin"`
  export PATH=`cygpath $NVM_SYMLINK`:`cygpath $NVM_HOME`:$PATH
else
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi
export SSL_KEY_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/client.pem"
export SSL_CA_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem"

npm run check:tls

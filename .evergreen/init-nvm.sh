#! /usr/bin/env bash

export PATH="/opt/mongodbtoolchain/v2/bin:$PATH"
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"

if [[ "$OS" == "Windows_NT" ]]; then
    NVM_HOME=$(cygpath -w "$NVM_DIR")
    export NVM_HOME
    NVM_SYMLINK=$(cygpath -w "$NODE_ARTIFACTS_PATH/bin")
    export NVM_SYMLINK
    NVM_ARTIFACTS_PATH=$(cygpath -w "$NODE_ARTIFACTS_PATH/bin")
    export NVM_ARTIFACTS_PATH
    PATH=$(cygpath $NVM_SYMLINK):$(cygpath $NVM_HOME):$PATH
    export PATH
    echo "updated path on windows PATH=$PATH"
else
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
fi

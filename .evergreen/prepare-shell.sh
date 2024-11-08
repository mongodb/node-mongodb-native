#! /usr/bin/env bash

# Only set errexit and xtrace if shell is NOT interactive
[[ $- == *i* ]] || set -o xtrace
[[ $- == *i* ]] || set -o errexit

# This script prepares a shell to run the remaining scripts in this folder
# It MUST be kept idempotent! It will overwrite the orchestration config and expansion.yml file upon every run
# and it will only clone drivers-tools if they do not exist one directory above our driver src

PROJECT_DIRECTORY="$(pwd)"
DRIVERS_TOOLS=$(cd .. && echo "$(pwd)/drivers-tools")
MONGO_ORCHESTRATION_HOME="$DRIVERS_TOOLS/.evergreen/orchestration"
MONGODB_BINARIES="$DRIVERS_TOOLS/mongodb/bin"
UPLOAD_BUCKET="${project}"

if [ "Windows_NT" = "${OS:-notWindows}" ]; then
  # fix paths on windows
  DRIVERS_TOOLS=$(cygpath -m -a "$DRIVERS_TOOLS")
  MONGO_ORCHESTRATION_HOME=$(cygpath -m -a "$MONGO_ORCHESTRATION_HOME")
  MONGODB_BINARIES=$(cygpath -m -a "$MONGODB_BINARIES")
  PROJECT_DIRECTORY=$(cygpath -m -a "$PROJECT_DIRECTORY")
fi

export PROJECT_DIRECTORY
export DRIVERS_TOOLS
export MONGO_ORCHESTRATION_HOME
export MONGODB_BINARIES

export TMPDIR="$MONGO_ORCHESTRATION_HOME/db"
export PATH="$MONGODB_BINARIES:$PATH"

if [ ! -d "$DRIVERS_TOOLS" ]; then
  # Only clone driver tools if it does not exist
  git clone --depth=1"https://github.com/mongodb-labs/drivers-evergreen-tools.git" "${DRIVERS_TOOLS}"
fi

echo "installed DRIVERS_TOOLS from commit $(git -C "${DRIVERS_TOOLS}" rev-parse HEAD)"

cat <<EOT > "$MONGO_ORCHESTRATION_HOME/orchestration.config"
{
  "releases": {
    "default": "$MONGODB_BINARIES"
  }
}
EOT

cat <<EOT > expansion.yml
DRIVERS_TOOLS: "$DRIVERS_TOOLS"
MONGO_ORCHESTRATION_HOME: "$MONGO_ORCHESTRATION_HOME"
MONGODB_BINARIES: "$MONGODB_BINARIES"
UPLOAD_BUCKET: "$UPLOAD_BUCKET"
PROJECT_DIRECTORY: "$PROJECT_DIRECTORY"
PREPARE_SHELL: |
    set -o errexit
    set -o xtrace
    export DRIVERS_TOOLS="$DRIVERS_TOOLS"
    export MONGO_ORCHESTRATION_HOME="$MONGO_ORCHESTRATION_HOME"
    export MONGODB_BINARIES="$MONGODB_BINARIES"
    export UPLOAD_BUCKET="$UPLOAD_BUCKET"
    export PROJECT_DIRECTORY="$PROJECT_DIRECTORY"
    export TMPDIR="$MONGO_ORCHESTRATION_HOME/db"
    export PATH="$MONGODB_BINARIES:$PATH"
    export PROJECT="${PROJECT}"
EOT
# See what we've done
cat expansion.yml

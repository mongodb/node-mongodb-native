#! /usr/bin/env bash

set -o xtrace
set -o errexit

PROJECT_DIRECTORY="$(pwd)"
DRIVERS_TOOLS=$(cd .. && echo "$(pwd)/drivers-tools")
MONGO_ORCHESTRATION_HOME="$DRIVERS_TOOLS/.evergreen/orchestration"
MONGODB_BINARIES="$DRIVERS_TOOLS/mongodb/bin"
UPLOAD_BUCKET="$project"

# fix paths on windows
if [ "Windows_NT" = "${OS:-notWindows}" ]; then
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
  git clone --depth=1 "https://github.com/mongodb-labs/drivers-evergreen-tools.git" "${DRIVERS_TOOLS}"
fi

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
    export PROJECT="${project}"
EOT
# See what we've done
cat expansion.yml

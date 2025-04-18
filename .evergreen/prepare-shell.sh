#! /usr/bin/env bash

# Only set errexit and xtrace if shell is NOT interactive
[[ $- == *i* ]] || set -o xtrace
[[ $- == *i* ]] || set -o errexit

# This script prepares a shell to run the remaining scripts in this folder
# It MUST be kept idempotent! It will overwrite the orchestration config and expansion.yml file upon every run

PROJECT_DIRECTORY="$(pwd)"
DRIVERS_TOOLS="$(pwd)/drivers-evergreen-tools"
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

# Note the evergreen option on git.get_project recurse_submodules does not work, so do it here.
# We ignore errors in case we are running in a container where git doesn't trust the tmp directory.
set +e
git submodule init
git submodule update
set -e

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

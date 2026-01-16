#!/bin/bash
set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

export MONGODB_URI="$1"

tar -xzf src/src.tgz
# produces src/

cd src

source ./.evergreen/prepare-shell.sh # should not run git clone

# load node.js
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

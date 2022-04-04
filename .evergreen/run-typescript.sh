#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

set -o xtrace

function get_current_ts_version {
    node -e "console.log(require('./package-lock.json').dependencies.typescript.version)"
}

CURRENT_TS_VERSION=$(get_current_ts_version)

export TSC="./node_modules/typescript/bin/tsc"
export TS_VERSION=${TS_VERSION:=$CURRENT_TS_VERSION}

npm install --no-save --force typescript@"$TS_VERSION"

echo "Typescript $($TSC -v)"

# check resolution uses the default latest types
echo "import * as mdb from '.'" > file.ts && node $TSC --noEmit --traceResolution file.ts | grep 'mongodb.d.ts' && rm file.ts

# check compilation
node $TSC mongodb.d.ts

if [[ $TRY_COMPILING_DRIVER != "false" ]]; then
    npm run build:ts
fi

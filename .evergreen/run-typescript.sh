#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

set -o xtrace

case $TS_CHECK in
    COMPILE_DRIVER|CHECK_TYPES)  # Ok
        ;;
    *)
        echo "TS_CHECK must be set to either COMPILE_DRIVER or CHECK_TYPES - received '$TS_CHECK'"
        exit 1
esac

if [ -z "$TS_VERSION" ]; then echo "TS_VERSION must be set"; exit 1; fi

if [ ! -f "mongodb.d.ts" ]; then
    echo "mongodb.d.ts should always exist because of the installation in prior steps but in case it doesn't, build it"
    npm i
fi

function get_ts_version() {
    if [ "$TS_VERSION" == "current" ]; then
        echo $(node -e "console.log(require('./package-lock.json').packages['node_modules/typescript'].version)")
    else
        echo $TS_VERSION
    fi
}

export TSC="./node_modules/typescript/bin/tsc"
export TS_VERSION=$(get_ts_version)

# On old versions of TS we need to put the node types back to 18.11.19
npm install --no-save --force typescript@"$TS_VERSION" "$(if [[ $TS_VERSION == '4.4' ]]; then echo "@types/node@18.11.19"; else echo ""; fi)"

echo "Typescript $($TSC -v)"

# check resolution uses the default latest types
echo "import * as mdb from '.'" > file.ts && node $TSC --noEmit --traceResolution file.ts | grep 'mongodb.d.ts' && rm file.ts

if [ "$TS_CHECK" == "COMPILE_DRIVER" ]; then
    echo "compiling driver"
    npm run build:ts
elif [ "$TS_CHECK" == "CHECK_TYPES" ]; then
    echo "checking driver types"
    # check compilation
    node $TSC mongodb.d.ts
else
    "Invalid value $TS_CHECK for TS_CHECK environment variable."
    exit 1
fi

#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

case $TS_CHECK in
    COMPILE_DRIVER|CHECK_TYPES)  # Ok
        ;;
    *)
        echo "TS_CHECK must be set to either COMPILE_DRIVER or CHECK_TYPES - received '$TS_CHECK'"
        exit 1
esac

if [ -z "$TS_VERSION" ]; then echo "TS_VERSION must be set"; exit 1; fi
if [ -z "$TYPES_VERSION" ]; then echo "TYPES_VERSION must be set"; exit 1; fi

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

npm install --no-save --force "typescript@$TS_VERSION" "@types/node@$TYPES_VERSION"

echo "Typescript $($TSC -v)"
echo "Types: $(cat node_modules/@types/node/package.json | jq -r .version)"
echo "Nodejs: $(node -v)"

# check resolution uses the default latest types
echo "import * as mdb from '.'" > file.ts && node $TSC --noEmit --traceResolution file.ts | grep 'mongodb.d.ts' && rm file.ts

if [ "$TS_CHECK" == "COMPILE_DRIVER" ]; then
    echo "compiling driver"
    npm run build:ts
elif [ "$TS_CHECK" == "CHECK_TYPES" ]; then
    echo "checking driver types"
    if [ "$TS_VERSION" == "4.4" ]; then
    # check compilation
        node $TSC mongodb.d.ts --module commonjs --target es2021
    else
    node $TSC mongodb.d.ts --module node16 --target es2021
    fi
else
    "Invalid value $TS_CHECK for TS_CHECK environment variable."
    exit 1
fi

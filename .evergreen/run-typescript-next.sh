#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

# source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

export TSC="./node_modules/typescript/bin/tsc"

# Check the next version of typescript
echo "Check the next version of typescript"
npm i --no-save typescript@next
echo "Typescript $($TSC -v)"

# clear lib directory just be sure it's a clean compile
rm -rf lib

# check driver code
npm run build:ts

# check public types
echo "import * as mdb from '.'" > file.ts && $TSC --noEmit --traceResolution file.ts | grep 'mongodb.d.ts' && rm file.ts

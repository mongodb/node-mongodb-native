#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

set -o xtrace

# Attempt to update our EVG config
# if it changes, crash so that any gen script changes are forced to be run before pushing
echo "Running evergreen config generation, expecting no changes..."
npm run build:evergreen
if ! git diff --exit-code ./.evergreen/config.yml; then
    echo "Evergreen unexpectedly changed!"
    echo "Did you run: node .evergreen/generate_evergreen_tasks.js"
fi

## Checks typescript, eslint, and prettier
npm run check:lint

npm run check:unit

echo "Typescript $(npx tsc -v)"
# check resolution uses the default latest types
echo "import * as mdb from '.'" > file.ts && npx tsc --noEmit --traceResolution file.ts | grep 'mongodb.d.ts' && rm file.ts

npm i --no-save typescript@4.0.2 # there is no 4.0.0
echo "Typescript $(npx tsc -v)"
npx tsc --noEmit mongodb.ts34.d.ts
# check that resolution uses the downleveled types
echo "import * as mdb from '.'" > file.ts && npx tsc --noEmit --traceResolution file.ts | grep 'mongodb.ts34.d.ts' && rm file.ts

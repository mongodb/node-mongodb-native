#! /bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

echo "Building driver..."
npm pack
echo "Building driver...finished."

echo "Node version: $(node -v)"
cd test/explicit-resource-management

pwd
npm i
npm t
mv xunit.xml ../..

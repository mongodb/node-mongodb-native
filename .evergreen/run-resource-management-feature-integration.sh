#! /bin/bash

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

echo "Building driver..."
npm pack
echo "Building driver...finished."

PACKAGE_FILE=$(ls mongodb-*.tgz)

mv $PACKAGE_FILE mongodb-current.tgz

echo "Node version: $(node -v)"
cd test/explicit-resource-management

npm i
npm t
mv xunit.xml ../..

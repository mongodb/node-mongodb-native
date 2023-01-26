#! /bin/bash

if [ -z "$MONGOSH_DIRECTORY" ]; then echo "MONGOSH_DIRECTORY must be set" && exit 1; fi

git clone --depth=10 -b misc-changes-for-node-driver-ci https://github.com/baileympearson/mongosh.git $MONGOSH_DIRECTORY

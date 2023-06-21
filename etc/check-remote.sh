#! /bin/bash

if git remote get-url --push origin | grep -qv "github.com:mongodb\|github.com/mongodb"; then
    echo "git remote does not match node-mongodb-native.  are you working off of a fork?"
    exit 1
fi

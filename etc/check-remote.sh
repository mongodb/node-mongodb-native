#! /bin/bash

echo "full list of remotes"
git remote -v

printf "\n\n"

echo "push origin remote"
git remote get-url --push origin

printf "\n\n"

echo "looking for 'github.com:mongodb' in uri"
git remote get-url --push origin | grep -v "github.com:mongodb"

printf "\n\n"

if git remote get-url --push origin | grep -qv "github.com:mongodb"; then
    echo "git remote does not match node-mongodb-native.  are you working off of a fork?"
    exit 1
fi

#! /bin/bash

git diff-index --cached HEAD --exit-code | grep "docs" --silent

if [[ "$?" == 0 ]]; then
    echo "You have staged changes.  Please clean your branch before releasing."
    exit 1
fi

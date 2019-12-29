#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "usage: run_each_test <test path>"
    exit
fi

TEST_PATH=$1
find $TEST_PATH -type f \( -iname "*.test.js" ! -iname "*atlas*" ! -path "*node-next*" \) -exec npx mocha {} \;

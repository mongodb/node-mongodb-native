#! /bin/bash

## check for staged changes in any directory other than "docs"
git diff-index --cached HEAD --exit-code | grep -v "docs" --silent

if [[ "$?" == 0 ]]; then
    echo "The release commit only allows staged files from the docs/ directory.  Please unstage any other changes."
    exit 1
fi

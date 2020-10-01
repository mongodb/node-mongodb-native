#!/usr/bin/env bash

# This script is used to fetch the latest tests for the specified spec.
# It puts the tests in the direcory $spec_root. It should be run from the root of the repository.

set -o errexit
set -o nounset

if [ ! -d ".git" ]; then
    echo "$0: This script must be run from the root of the repository" >&2
    exit 1
fi

if [ $# -ne 1 ]; then
    echo "$0: This script must be passed exactly one argument for which tests to sync" >&2
    exit 1
fi

spec_root="test/spec"

tmpdir=$(mktemp -d -t spec_testsXXXX)
curl -sL "https://github.com/mongodb/specifications/archive/master.zip" -o "$tmpdir/specs.zip"
unzip -d "$tmpdir" "$tmpdir/specs.zip" > /dev/null
mkdir -p "$spec_root/$1"
rsync -ah --exclude '*.rst' "$tmpdir/specifications-master/source/$1/tests/" "$spec_root/$1" --delete
rm -rf "$tmpdir"

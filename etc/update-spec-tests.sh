#!/usr/bin/env bash

# This script is used to fetch the latest tests for the specified spec.
# It puts the tests in the direcory $spec_root. It should be run from the root of the repository.

set -o errexit
set -o nounset

if [ ! -d ".git" ]; then
    echo "$0: This script must be run from the root of the repository" >&2
    exit 1
fi

if [ $1 == "-h" ] || [ $1 == "--help" ]; then
    echo "USAGE: $0 SPEC_NAME [GIT_REF]" >&2
    echo -e "SPEC_NAME\tThe spec name to fetch matching the folder name in 'specifications/source'" >&2
    echo -e "[GIT_REF]\tAn optional git reference to fetch specs from, can be commit short code or branch name" >&2
    exit 0
fi

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "$0: This script must be passed at least one argument for which tests to sync" >&2
    echo "And optionally can be passed a git ref to fetch specs from" >&2
    exit 1
fi

git_ref=${2:-master}
spec_root="test/spec"

tmpdir=$(mktemp -d -t spec_testsXXXX)
curl -sL "https://github.com/mongodb/specifications/archive/${git_ref}.zip" -o "$tmpdir/specs.zip"
unzip -d "$tmpdir" "$tmpdir/specs.zip" > /dev/null
mkdir -p "$spec_root/$1"
spec_folder_name=$(ls $tmpdir | grep -v 'specs.zip')
rsync -ah "$tmpdir/${spec_folder_name}/source/$1/tests/" "$spec_root/$1" --delete
rm -rf "$tmpdir"

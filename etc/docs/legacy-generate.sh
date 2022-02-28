#!/usr/bin/env bash

#
# This is a script that was
#

set -o errexit
set -o xtrace

echo "Warning - this script has not yet been run in the node-mongodb-native repo"

export JSDOC=${JSDOC:-jsdoc}
export HUGO=${HUGO:-hugo}
# The list of branches to clone and generate docs for
# All the existing docs versions will be left untouched
if [ "$#" -eq 0 ]; then
  export BRANCHES=("main")
else
  export BRANCHES=( "$@" )
fi

# ensure hugo is installed
if ! command -v "$HUGO" &> /dev/null; then
    echo "$HUGO could not be found"
    echo "download hugo here: https://github.com/gohugoio/hugo/releases/tag/v0.30.2 and install it somewhere in your PATH"
    exit 1
fi

# ensure jsdoc is installed
if ! command -v "$JSDOC" &> /dev/null; then
    echo "$JSDOC could not be found"
    echo "npm i -g jsdoc"
    exit 1
fi

function generate_3x () {
    local branch=$1

    echo "== Generating $branch docs"
    pushd "checkout/$branch"
    $HUGO -s docs/reference -d ../../public -b "/node-mongodb-native/$branch" -t mongodb
    $JSDOC -c conf.json -t docs/jsdoc-template/ -d ./public/api
    cp -R ./public/api/scripts ./public/.
    cp -R ./public/api/styles ./public/.
    popd
}

function generate_4x () {
    local branch=$1

    echo "== Generating $branch docs"
    pushd "checkout/$branch"
	npm run build:docs
    popd
}

DRIVER_CLONE_URL="https://github.com/mongodb/node-mongodb-native.git"

echo "== Generating Main docs"
rm -rf ./public

# Generate the base site
# when a new version is added, it's necessary to re-run the template
#  generation to add links for the new version on the main documentation page
$HUGO -s template/ -d ../public -b "/node-mongodb-native"

for branch in "${BRANCHES[@]}"; do

    if [ -d "checkout/$branch" ]; then
        echo "checkout/$branch already exists, resetting"
        echo "double check there are no unexpected changes"
        git --git-dir "checkout/$branch/.git" clean -dfx
        git --git-dir "checkout/$branch/.git" fetch origin
        git --git-dir "checkout/$branch/.git" reset --hard "origin/$branch"
    else
        echo "cloning driver $branch to checkout/$branch"
        git clone --branch "$branch" --depth 1 "$DRIVER_CLONE_URL" "checkout/$branch"
    fi

    pushd "checkout/$branch"
    npm install
    npm install mongodb-client-encryption
    npm install --no-save typedoc
    popd

    MAJOR_VERSION=${branch:0:1}

    case $MAJOR_VERSION in
        "3")
            generate_3x "$branch"
            cp -R "checkout/$branch/public" "./public/$branch"
        ;;
        "4")
            generate_4x "$branch"
            cp -R "checkout/$branch/docs/public" "./public/$branch"
        ;;

        # if 'main' is specified as a branch, we're releasing a new version
        # TODO: figure out a way to pass in the version
        "m")
            echo "HEY YOU BETTER EDIT ME!!!"
            echo "YOU NEED TO MANUALLY SPECIFY THE BRANCH FOR NOW"
            echo "TODO"
            VERSION=4.4
            exit 1

            cp checkout/main "checkout/$VERSION"
            generate_4x "$VERSION"
            cp -R "checkout/$VERSION/docs/public" "./public/$VERSION"
        ;;
        *)
            echo "no support for $branch docs"
            exit 1
        ;;
    esac
done

echo "copying generated docs to the gh-pages branch"
rm -rf ./gh-pages
git clone --branch "gh-pages" --depth 1 "$DRIVER_CLONE_URL" "gh-pages"
cp -R "public/." "gh-pages/."

echo "cleaning up temporary branches"
rm -rf "$WORKING_DIR"/checkout

pushd "gh-pages"
git add -A
git status
popd

echo -e "Inspect the changes above. If they look right to you run the following:\n\n"

cat << EOF
cd gh-pages
git commit -m "Updated documentation"
git push origin gh-pages
cd ..
EOF

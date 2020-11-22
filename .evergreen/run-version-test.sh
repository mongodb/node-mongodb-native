set -o errexit
set -o xtrace

DRIVER_VERSION=$1
echo "MONGODB_URI=$MONGODB_URI PLATFORM=$PLATFORM DRIVER_VERSION=$DRIVER_VERSION"

if [[ $DRIVER_VERSION != '3.6' ]]; then
  echo "Unsupported driver version: ${DRIVER_VERSION}"
  exit 1
fi

export PROJECT_DIRECTORY=$(cd $(dirname ${BASH_SOURCE[0]}) && cd .. && pwd)
export NODE_LTS_VERSION=dubnium

if [[ $OS == "Windows_NT" || $PLATFORM == "windows-64" ]]; then
  export PROJECT_DIRECTORY=`cygpath -w "$PROJECT_DIRECTORY"`
fi

echo "PROJECT_DIRECTORY=$PROJECT_DIRECTORY NODE_LTS_VERSION=$NODE_LTS_VERSION"

cd $PROJECT_DIRECTORY

# todo - move below git checkout when merged into 3.6
bash .evergreen/install-dependencies.sh
echo "Dependencies installed, running test suite"

git checkout $DRIVER_VERSION
echo "Checked out version branch, running dependency installation"

npm run test-nolint && echo "Tests complete"

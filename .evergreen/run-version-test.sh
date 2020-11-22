set -o errexit

DRIVER_VERSION=$1
echo "MONGODB_URI=$MONGODB_URI PLATFORM=$PLATFORM DRIVER_VERSION=$DRIVER_VERSION"

if [[ $DRIVER_VERSION != '3.6' ]]; then
  echo "Unsupported driver version: ${DRIVER_VERSION}"
  exit 1
fi

export PROJECT_DIRECTORY=$(cd $(dirname ${BASH_SOURCE[0]}) && cd .. && pwd)
export NODE_LTS_VERSION=dubnium
cd $PROJECT_DIRECTORY
git checkout $DRIVER_VERSION
bash .evergreen/install-dependencies.sh
npm run test-nolint

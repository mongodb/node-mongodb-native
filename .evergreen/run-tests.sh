#!/bin/sh
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Supported/used environment variables:
#       AUTH                    Set to enable authentication. Defaults to "noauth"
#       SSL                     Set to enable SSL. Defaults to "nossl"
#       MONGODB_URI             Set the suggested connection MONGODB_URI (including credentials and topology info)
#       MARCH                   Machine Architecture. Defaults to lowercase uname -m

AUTH=${AUTH:-noauth}
SSL=${SSL:-nossl}
MONGODB_URI=${MONGODB_URI:-}
DRIVERS_TOOLS=${DRIVERS_TOOLS:-}
MONGODB_VERSION=${MONGODB_VERSION:-}

# install MongoDB
# Functions to fetch MongoDB binaries
. ${DRIVERS_TOOLS}/.evergreen/download-mongodb.sh

get_distro
if [ -z "$MONGODB_DOWNLOAD_URL" ]; then
    get_mongodb_download_url_for "$DISTRO" "$MONGODB_VERSION"
fi
# Even though we have the MONGODB_DOWNLOAD_URL, we still call this to get the proper EXTRACT variable
get_mongodb_download_url_for "$DISTRO"
download_and_extract "$MONGODB_DOWNLOAD_URL" "$EXTRACT"

# run tests
echo "Running $AUTH tests over $SSL, connecting to $MONGODB_URI"

export PATH="/opt/mongodbtoolchain/v2/bin:$PATH"
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
MONGODB_VERSION=${MONGODB_VERSION} MONGODB_ENVIRONMENT=${TOPOLOGY} npm test -- --local

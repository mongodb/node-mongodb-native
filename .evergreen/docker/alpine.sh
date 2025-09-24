#! /bin/bash

# script to aid in local testing of linux platforms
# requires a running docker instance

if [ -z ${NODE_LTS_VERSION+omitted} ]; then echo "NODE_LTS_VERSION is unset" && exit 1; fi
if [ -z ${DRIVERS_TOOLS+omitted} ]; then echo "DRIVERS_TOOLS is unset" && exit 1; fi
if [ -z ${MONGODB_URI+omitted} ]; then echo "MONGODB_URI is unset" && exit 1; fi

# ubuntu2204 hosts in ci use amd64
LINUX_ARCH=${LINUX_ARCH:-amd64}

IMAGE_TAG=${IMAGE_TAG:-alpine-fle-image}

build_alpine() {
    docker buildx create --name builder --bootstrap --use

    BASE_TAG=$LINUX_ARCH-alpine-base-node-$NODE_LTS_VERSION
    docker --debug buildx build --load --progress=plain \
        --platform linux/$LINUX_ARCH \
        --build-arg="ARCH=$LINUX_ARCH" \
        --build-arg="NODE_LTS_VERSION=$NODE_LTS_VERSION" \
        --build-arg="DRIVERS_TOOLS=$DRIVERS_TOOLS" \
        -f ./.evergreen/docker/Dockerfile.musl -t $IMAGE_TAG \
        .
}

test_alpine() {
    # # launch a mongocryptd on the host.
    ./mongodb/bin/mongocryptd --fork --port 3000 --pidfilepath $(pwd)/pid.file --logpath $(pwd)/logpath
    MONGOCRYPTD_URI='mongodb://localhost:3000'

    # set up FLE creds on host.  don't download cryptd because we don't need it.
    RUN_WITH_MONGOCRYPTD=true bash .evergreen/setup-fle.sh

    # remove node_modules to remove any already downloaded prebuilds
    rm -rf node_modules

    # run FLE tests in container, using mongocryptd and replica set running on host.
    # mount the current directory (the driver's root) as /node-mongodb-native and
    # use that as the working directory for `run-alpine-fle-tests.sh`
    docker --debug run \
        --platform linux/$LINUX_ARCH \
        -e MONGODB_URI=${MONGODB_URI} -e MONGOCRYPTD_URI=${MONGOCRYPTD_URI} \
        --volume $(pwd):/node-mongodb-native -w /node-mongodb-native \
        --network host \
        --entrypoint bash \
        $IMAGE_TAG \
        '.evergreen/run-alpine-fle-tests.sh'
}

build_alpine
test_alpine

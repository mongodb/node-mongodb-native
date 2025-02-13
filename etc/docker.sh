#! /bin/bash

# script to aid in local testing of linux platforms
# requires a running docker instance

# s390x, arm64, amd64 for ubuntu
# amd64 or arm64v8 for alpine
LINUX_ARCH=arm64v8

# 16.20.1+, default 16.20.1
NODE_VERSION=20.0.0

IMAGE_TAG=alpine-fle-image

build_alpine() {
    docker buildx create --name builder --bootstrap --use

    # set up FLE creds on host.  don't download cryptd because we don't need it.
    # TODO: once we map cwd onto the host, we don't need to build the image with the credential file present.
    RUN_WITH_MONGOCRYPTD=true bash .evergreen/setup-fle.sh

    BASE_TAG=$LINUX_ARCH-alpine-base-node-$NODE_VERSION
    docker --debug buildx build --load --progress=plain \
        --platform linux/$LINUX_ARCH \
        --build-arg="ARCH=$LINUX_ARCH" \
        --build-arg="NODE_VERSION=$NODE_VERSION" \
        --build-arg="DRIVERS_TOOLS=$DRIVERS_TOOLS" \
        -f ./.evergreen/docker/Dockerfile.musl -t $IMAGE_TAG \
        .
}

test_alpine() {
    # launch a mongocryptd on the host.
    ./mongodb/bin/mongocryptd --fork --port 3000 --pidfilepath $(pwd)/pid.file --logpath $(pwd)/logpath
    MONGOCRYPTD_URI='mongodb://localhost:3000'

    # run FLE tests in container, using mongocryptd and replica set running on host
    docker --debug run \
        --platform linux/$LINUX_ARCH \
        -e MONGODB_URI=${MONGODB_URI} -e MONGOCRYPTD_URI=${MONGOCRYPTD_URI} \
        --network host \
        --entrypoint bash \
        $IMAGE_TAG \
        '.evergreen/run-alpine-fle-tests.sh'
}

build_alpine
test_alpine

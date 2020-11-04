#!/bin/bash
set -e

DOCKER_IMAGE=node-mongodb-native/docker-mongodb

function die_with_usage {
    printf "usage:\tdocker_cluster <server|replica_set|sharded_cluster|all> <mongo version>\n\tdocker_cluster killall\n"
    exit
}

function docker_mongodb {
    if [[ $1 == "replica_set" ]]; then
        docker run --name "mongo_${1}_${2}" --rm -d -p 31000-31003:31000-31003 -e MONGO_VERSION=$2 ${DOCKER_IMAGE} replica
        echo "mongodb://localhost:31000/?replicaSet=rs"
    elif [[ $1 == "sharded_cluster" ]]; then
        docker run --name "mongo_${1}_${2}" --rm -d -p 51000-51006:51000-51006 -e MONGO_VERSION=$2 ${DOCKER_IMAGE} sharded
        echo "mongodb://localhost:51000,localhost:51001/"
    elif [[ $1 == "server" ]]; then
        docker run --name "mongo_${1}_${2}" --rm -d -p 27017:27017 -e MONGO_VERSION=$2 -e HOSTNAME=$(hostname) ${DOCKER_IMAGE} single
        echo "mongodb://localhost:27017"
    elif [[ $1 == "all" ]]; then
        docker_mongodb server $2 &
        docker_mongodb replica_set $2 &
        docker_mongodb sharded_cluster $2 &
        wait
        return
    else
        echo "unsupported topology: $1"
        die_with_usage
    fi

    docker ps -f name=mongo_${1}_${2}

    printf "\n[ Tailing container logs, Ctrl+C to exit; the container is detached and will continue running until stopped with 'docker kill' ]\n\n"
    docker logs -f $(docker ps -f name=mongo_${1}_${2} -q)
}

if [ "$#" -ne 2 ] && [ ${1:-''} != "killall" ]; then
    die_with_usage
fi

if [[ $1 == "killall" ]]; then
    RUNNING=$(docker ps -f ancestor=${DOCKER_IMAGE} -q)
    if [[ $RUNNING ]]; then
        docker kill $RUNNING
        echo "Killed all running mongo containers"
    else
        echo "No running mongo containers"
    fi
    exit
else
    if [[ $(docker image ls -q ${DOCKER_IMAGE}) ]]; then
        echo "Image already cached, skipping build; force a rebuild with 'docker build --no-cache'"
    else
        cd "${0%/*}/docker-mongodb"
        docker build -t ${DOCKER_IMAGE} .
    fi
    docker_mongodb $1 $2
fi
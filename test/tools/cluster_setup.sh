#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "usage: cluster_setup <server|replica_set|sharded_cluster>"
    echo "override <DATA_DIR | SINGLE_DIR | REPLICASET_DIR | SHARDED_DIR> env variables to change dbPath"
    exit
fi

DATA_DIR=${DATA_DIR:-data}
SINGLE_DIR=${SINGLE_DIR:-$DATA_DIR/server}
REPLICASET_DIR=${REPLICASET_DIR:-$DATA_DIR/replica_set}
SHARDED_DIR=${SHARDED_DIR:-$DATA_DIR/sharded_cluster}

if [[ $1 == "replica_set" ]]; then
    mkdir -p $REPLICASET_DIR # user / password
    mlaunch init --dir $REPLICASET_DIR --ipv6 --auth --username "bob" --password "pwd123" --replicaset --nodes 3 --arbiter --name "repl0" --port 27017 --enableMajorityReadConcern --setParameter enableTestCommands=1
    echo "mongodb://bob:pwd123@localhost:27017,localhost:27018,localhost:27019/?replicaSet=repl0"
elif [[ $1 == "sharded_cluster" ]]; then
    mkdir -p $SHARDED_DIR
    mlaunch init --dir $SHARDED_DIR --ipv6 --auth --username "bob" --password "pwd123" --replicaset --nodes 3 --name rs --port 51000 --enableMajorityReadConcern --setParameter enableTestCommands=1 --sharded 1 --mongos 2
    echo "mongodb://bob:pwd123@localhost:51000,localhost:51001"
elif [[ $1 == "server" ]]; then
    mkdir -p $SINGLE_DIR
    mlaunch init --dir $SINGLE_DIR --ipv6 --auth --username "bob" --password "pwd123" --single --setParameter enableTestCommands=1
    echo "mongodb://bob:pwd123@localhost:27017"
else
    echo "unsupported topology: $1"
fi

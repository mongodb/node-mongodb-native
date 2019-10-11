#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "usage: cluster_setup <server|replica_set|sharded_cluster>"
    exit
fi

if [[ $1 == "replica_set" ]]; then
    mlaunch init --replicaset --nodes 3 --arbiter --name rs --port 31000 --enableMajorityReadConcern --setParameter enableTestCommands=1
    echo "mongodb://localhost:31000/?replicaSet=rs"
elif [[ $1 == "sharded_cluster" ]]; then
    mlaunch init --replicaset --nodes 3 --arbiter --name rs --port 51000 --enableMajorityReadConcern --setParameter enableTestCommands=1 --sharded 1 --mongos 2
    echo "mongodb://localhost:51000,localhost:51001/"
elif [[ $1 == "server" ]]; then
    mlaunch init --single --setParameter enableTestCommands=1
    echo "mongodb://localhost:27017"
else
    echo "unsupported topology: $1"
fi

#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "usage: cluster_setup <single|replicaset|sharded>"
    exit
fi


if [[ $1 == "replicaset" ]]; then
    mlaunch init --replicaset --nodes 3 --arbiter --name rs --port 31000 --enableMajorityReadConcern --setParameter enableTestCommands=1  
elif [[ $1 == "sharded" ]]; then
    mlaunch init --replicaset --nodes 3 --arbiter --name rs --port 51000 --enableMajorityReadConcern --setParameter enableTestCommands=1 --sharded 1 --mongos 2
elif [[ $1 == "single" ]]; then
    mlaunch init --single --setParameter enableTestCommands=1
    echo "unimplemented"
else
    echo "unsupported topology: $1"
fi


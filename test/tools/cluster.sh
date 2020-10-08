#!/bin/bash

if [ "$#" -lt 1 ]; then
    printf "usage: cluster COMMAND TOPOLOGY\n"
    printf "COMMAND\n"
    printf "\tinit\tsetup the topology\n"
    printf "\tstart\trun the topology in background\n"
    printf "\tstop\tshutdown the topology gracefully\n"
    printf "\tprune\tdelete the topology's data directory including logs\n"
    printf "\tkill\tforce shutdown the topology\n"
    printf "\turi\techo the uri for the topology\n"
    printf "\ttest\trun the tests against the specified topology\n"
    printf "TOPOLOGY\n"
    printf "\tsingle\ta single standalone mongod\n"
    printf "\treplica\ta 3 node replicaset named 'rs'\n"
    printf "\tsharded\ta sharded cluster\n"
    exit 0
fi

PORT_REPLICA=31000
PORT_SHARDED=51000
PORT_SINGLE=27017

log () {
  echo "$1 --------------------"
}

cluster () {
    COMMAND="$1"
    if [[ "$COMMAND" == "uri" ]]; then
        TOPOLOGY=$2
        if [[ "$TOPOLOGY" == "replica" ]] || [[ "$TOPOLOGY" == "replicaset" ]] || [[ "$TOPOLOGY" == "replica_set" ]]; then
            MONGODB_URI="mongodb://localhost:$PORT_REPLICA/?replicaSet=rs"
            export MONGODB_URI
            echo $MONGODB_URI
        elif [[ "$TOPOLOGY" == "sharded" ]] || [[ "$TOPOLOGY" == "sharded_clister" ]] || [[ "$TOPOLOGY" == "shardedcluster" ]] || [[ "$TOPOLOGY" == "mongos" ]]; then
            ADD_PORT=$(( $PORT_SHARDED + 1 ))
            MONGODB_URI="mongodb://localhost:$PORT_SHARDED,localhost:$ADD_PORT"
            export MONGODB_URI
            echo $MONGODB_URI
        elif [[ "$TOPOLOGY" == "standalone" ]] || [[ "$TOPOLOGY" == "server" ]] || [[ "$TOPOLOGY" == "single" ]]; then
            MONGODB_URI="mongodb://localhost:$PORT_SINGLE"
            export MONGODB_URI
            echo $MONGODB_URI
        else
            echo "uri subcommand needs at least one argument"
            exit 1
        fi
    elif [[ "$COMMAND" == "init" ]]; then
        TOPOLOGY=$2
        if [[ "$TOPOLOGY" == "replica" ]] || [[ "$TOPOLOGY" == "replicaset" ]] || [[ "$TOPOLOGY" == "replica_set" ]]; then
            log 'init replica'
            mlaunch init --dir "./data/$PORT_REPLICA" --replicaset --nodes 3 --arbiter --name rs --port "$PORT_REPLICA" --enableMajorityReadConcern --setParameter enableTestCommands=1
            cluster uri replica
        elif [[ "$TOPOLOGY" == "sharded" ]] || [[ "$TOPOLOGY" == "sharded_clister" ]] || [[ "$TOPOLOGY" == "shardedcluster" ]] || [[ "$TOPOLOGY" == "mongos" ]]; then
            log 'init sharded'
            mlaunch init --dir "./data/$PORT_SHARDED" --replicaset --nodes 3 --arbiter --name rs --port "$PORT_SHARDED" --setParameter enableTestCommands=1 --sharded 1 --mongos 2
            cluster uri sharded
        elif [[ "$TOPOLOGY" == "standalone" ]] || [[ "$TOPOLOGY" == "server" ]] || [[ "$TOPOLOGY" == "single" ]]; then
            log 'init single'
            mlaunch init --dir "./data/$PORT_SINGLE" --single --setParameter enableTestCommands=1
            cluster uri single
        else
            cluster init replica
            cluster init sharded
            cluster init single
        fi
    elif [[ "$COMMAND" == "start" ]]; then
        TOPOLOGY=$2
        if [[ "$TOPOLOGY" == "replica" ]] || [[ "$TOPOLOGY" == "replicaset" ]] || [[ "$TOPOLOGY" == "replica_set" ]]; then
            log 'starting replica'
            mlaunch start --dir "./data/$PORT_REPLICA"
            if [ $? -ne 0 ]; then
                cluster init replica
            fi
        elif [[ "$TOPOLOGY" == "sharded" ]] || [[ "$TOPOLOGY" == "sharded_clister" ]] || [[ "$TOPOLOGY" == "shardedcluster" ]] || [[ "$TOPOLOGY" == "mongos" ]]; then
            log 'starting shared'
            mlaunch start --dir "./data/$PORT_SHARDED"
            if [ $? -ne 0 ]; then
                cluster init sharded
            fi
        elif [[ "$TOPOLOGY" == "standalone" ]] || [[ "$TOPOLOGY" == "server" ]] || [[ "$TOPOLOGY" == "single" ]]; then
            log 'starting single'
            mlaunch start --dir "./data/$PORT_SINGLE"
            if [ $? -ne 0 ]; then
                cluster init single
            fi
        else
            cluster start replica
            cluster start sharded
            cluster start single
        fi
    elif [[ "$COMMAND" == "stop" ]]; then
        TOPOLOGY=$2
        if [[ "$TOPOLOGY" == "replica" ]] || [[ "$TOPOLOGY" == "replicaset" ]] || [[ "$TOPOLOGY" == "replica_set" ]]; then
            log 'stopping replica'
            mlaunch stop --dir "./data/$PORT_REPLICA"
            if [ $? -ne 0 ]; then
                echo "error: cannot stop replica, not initalized"
            fi
        elif [[ "$TOPOLOGY" == "sharded" ]] || [[ "$TOPOLOGY" == "sharded_clister" ]] || [[ "$TOPOLOGY" == "shardedcluster" ]] || [[ "$TOPOLOGY" == "mongos" ]]; then
            log 'stopping sharded'
            mlaunch stop --dir "./data/$PORT_SHARDED"
            if [ $? -ne 0 ]; then
                echo "error: cannot stop sharded, not initalized"
            fi
        elif [[ "$TOPOLOGY" == "standalone" ]] || [[ "$TOPOLOGY" == "server" ]] || [[ "$TOPOLOGY" == "single" ]]; then
            log 'stopping single'
            mlaunch stop --dir "./data/$PORT_SINGLE"
            if [ $? -ne 0 ]; then
                echo "error: cannot stop single, not initalized"
            fi
        else
            cluster stop replica
            cluster stop sharded
            cluster stop single
        fi
    elif [[ "$COMMAND" == "prune" ]]; then
        TOPOLOGY=$2
        if [[ "$TOPOLOGY" == "replica" ]] || [[ "$TOPOLOGY" == "replicaset" ]] || [[ "$TOPOLOGY" == "replica_set" ]]; then
            log 'pruning replica'
            cluster stop replica
            log 'removing replica'
            rm -rf "./data/$PORT_REPLICA";
        elif [[ "$TOPOLOGY" == "sharded" ]] || [[ "$TOPOLOGY" == "sharded_clister" ]] || [[ "$TOPOLOGY" == "shardedcluster" ]] || [[ "$TOPOLOGY" == "mongos" ]]; then
            log 'pruning sharded'
            cluster stop sharded
            log 'removing sharded'
            rm -rf "./data/$PORT_SHARDED";
        elif [[ "$TOPOLOGY" == "standalone" ]] || [[ "$TOPOLOGY" == "server" ]] || [[ "$TOPOLOGY" == "single" ]]; then
            log 'pruning server'
            cluster stop single
            log 'removing server'
            rm -rf "./data/$PORT_SINGLE";
        else
            cluster prune replica
            cluster prune sharded
            cluster prune single
        fi
      elif [[ "$COMMAND" == "kill" ]]; then
        TOPOLOGY=$2
        if [[ "$TOPOLOGY" == "replica" ]] || [[ "$TOPOLOGY" == "replicaset" ]] || [[ "$TOPOLOGY" == "replica_set" ]]; then
            log 'killing replica'
            PORT1=$PORT_REPLICA
            PORT2=$(( $PORT1 + 1 ))
            PORT3=$(( $PORT2 + 1 ))
            PORT4=$(( $PORT3 + 1 ))
            npx -q fkill-cli :"$PORT1" :"$PORT2" :"$PORT3" :"$PORT4" -fs
        elif [[ "$TOPOLOGY" == "sharded" ]] || [[ "$TOPOLOGY" == "sharded_clister" ]] || [[ "$TOPOLOGY" == "shardedcluster" ]] || [[ "$TOPOLOGY" == "mongos" ]]; then
            log 'killing sharded'
            PORT1=$PORT_SHARDED
            PORT2=$(( $PORT1 + 1 ))
            PORT3=$(( $PORT2 + 1 ))
            PORT4=$(( $PORT3 + 1 ))
            PORT5=$(( $PORT4 + 1 ))
            PORT6=$(( $PORT5 + 1 ))
            PORT7=$(( $PORT6 + 1 ))
            npx -q fkill-cli :"$PORT1" :"$PORT2" :"$PORT3" :"$PORT4" :"$PORT5" :"$PORT6" :"$PORT7" -fs
        elif [[ "$TOPOLOGY" == "standalone" ]] || [[ "$TOPOLOGY" == "server" ]] || [[ "$TOPOLOGY" == "single" ]]; then
            log 'killing single'
            npx -q fkill-cli :$PORT_SINGLE -fs
        else
            cluster kill replica
            cluster kill sharded
            cluster kill single
        fi
      elif [[ "$COMMAND" == "test" ]]; then
        TOPOLOGY=$2
        if [[ "$TOPOLOGY" == "replica" ]] || [[ "$TOPOLOGY" == "replicaset" ]] || [[ "$TOPOLOGY" == "replica_set" ]]; then
            cluster start replica && cluster uri replica && npm run test-nolint --if-present && npm run check:test --if-present
        elif [[ "$TOPOLOGY" == "sharded" ]] || [[ "$TOPOLOGY" == "sharded_clister" ]] || [[ "$TOPOLOGY" == "shardedcluster" ]] || [[ "$TOPOLOGY" == "mongos" ]]; then
            cluster start sharded && cluster uri sharded && npm run test-nolint --if-present && npm run check:test --if-present
        elif [[ "$TOPOLOGY" == "standalone" ]] || [[ "$TOPOLOGY" == "server" ]] || [[ "$TOPOLOGY" == "single" ]]; then
            cluster start single && cluster uri single && npm run test-nolint --if-present && npm run check:test --if-present
        else
            echo "test subcommand needs one argument"
            exit 1
        fi
    else
        echo "unsupported subcommand: $COMMAND"
        exit 1
    fi
}

cluster "$@"

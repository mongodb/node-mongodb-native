#!/bin/bash
#
DATA_DIR=${DATA_DIR:-data}
LOADBALANCED_DIR=${LOADBALANCED_DIR:-$DATA_DIR/load_balanced}
DRIVERS_TOOLS=${DRIVERS_TOOLS:-../drivers-tools/}

mkdir -p $LOADBALANCED_DIR
mlaunch init --dir data --ipv6 --replicaset --nodes 2 --port 51000 --name testing --setParameter enableTestCommands=1 --sharded 1 --mongos 2
mlaunch stop

# Update .mlaunch_startup file
TMP_MLAUNCH_STARTUP=$(mktemp)

jq '.startup_info."51000"=(.startup_info."51000" + " --setParameter \"loadBalancerPort=27050\"") | .startup_info."51001"=(.startup_info."51001" + " --setParameter \"loadBalancerPort=27051\"")' $DATA_DIR/.mlaunch_startup > $TMP_MLAUNCH_STARTUP
mv $TMP_MLAUNCH_STARTUP $DATA_DIR/.mlaunch_startup

mlaunch start
export MONGODB_URI="mongodb://bob:pwd123@localhost:51000,localhost:51001"
echo $MONGODB_URI

$DRIVERS_TOOLS/.evergreen/run-load-balancer.sh start

# generate env file
cat lb-expansion.yml | sed 's/: /=/g' > lb.env

source lb.env
export SINGLE_MONGOS_LB_URI
export MULTI_MONGOS_LB_URI 

export LOAD_BALANCER=true
export AUTH=noauth

#! /bin/bash
set -e

if [ "${1:0:1}" = '-' ]; then
  set -- mlaunch "$@"
fi

if [ "$1" = 'mlaunch' ]; then
  if [ -f /data/.mlaunch_startup ] ; then
    echo 'Already initialized. Ignoring provided command!'
    mlaunch start
  else
    m $MONGO_VERSION
    $@
  fi
elif [ "$1" = 'single' ]; then
  m $MONGO_VERSION
  mlaunch init --dir /data --bind_ip 0.0.0.0 --hostname $HOSTNAME --single --setParameter enableTestCommands=1
elif [ "$1" = 'replica' ]; then
  m $MONGO_VERSION
  mlaunch init --dir /data --bind_ip 0.0.0.0 --replicaset --nodes 3 --arbiter --name rs --port 31000 --enableMajorityReadConcern --setParameter enableTestCommands=1
elif [ "$1" = 'sharded' ]; then
  m $MONGO_VERSION
  mlaunch init --dir /data --bind_ip 0.0.0.0 --replicaset --nodes 3 --arbiter --name rs --port 51000 --enableMajorityReadConcern --setParameter enableTestCommands=1 --sharded 1 --mongos 2
else
  echo "Invalid syntax"
fi

sleep 2

if [ -d /data/rs ]; then
  tail -f /data/rs/*/mongod.log
elif [ -d /data/configRepl ]; then
  tail -f /data/mongos/mongos_*.log /data/**/**/mongod.log
else
  tail -f /data/mongod.log
fi

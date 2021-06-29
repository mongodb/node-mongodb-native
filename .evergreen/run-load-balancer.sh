#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

DRIVERS_TOOLS=$(cd "$(dirname "$0")" && pwd)/..
MONGODB_URI=${MONGODB_URI:-}
if [ -z "$MONGODB_URI" ]; then
    echo 'The MONGODB_URI environment variable is required!'
    echo 'For example: '
    echo '   MONGODB_URI="mongodb://localhost:27017,localhost:27018/'
    echo 'or:'
    echo '   MONGODB_URI="mongodb://user:password@localhost:27017,localhost:27018/?authSource=admin&tls=true'
    exit 1
fi

start() {
  echo "Starting HAProxy..."

  cat <<EOF_HAPROXY_CONFIG > $DRIVERS_TOOLS/haproxy.conf
  defaults
      mode tcp
      timeout connect 10s
      timeout client 30m
      timeout server 30m

  frontend mongos_frontend
      bind *:8000
      use_backend mongos_backend

  frontend mongoses_frontend
      bind *:8001
      use_backend mongoses_backend

  backend mongos_backend
      mode tcp
      server mongos 127.0.0.1:27017 check

  backend mongoses_backend
      mode tcp
      server mongos_one 127.0.0.1:27017 check
      server mongos_two 127.0.0.1:27018 check
EOF_HAPROXY_CONFIG

  PREFIX=$(echo $MONGODB_URI | grep -Eo "(.*?)@" | cat)
  SUFFIX=$(echo $MONGODB_URI | grep -Eo "\?(.*)" | cat)

  if [[ $PREFIX = "" ]]
  then
    # No auth then just set the URI
    SINGLE_MONGOS_LB_URI="mongodb://127.0.0.1:8000/"
    MULTI_MONGOS_LB_URI="mongodb://127.0.0.1:8001/"
  else
    # We have auth so append the lb host:port
    SINGLE_MONGOS_LB_URI="${PREFIX}127.0.0.1:8000/"
    MULTI_MONGOS_LB_URI="${PREFIX}127.0.0.1:8001/"
  fi

  if [[ $SUFFIX = "" ]]
  then
    # If there are no query params then add only the load balanced option.
    SINGLE_MONGOS_LB_URI="${SINGLE_MONGOS_LB_URI}?loadBalanced=true"
    MULTI_MONGOS_LB_URI="${MULTI_MONGOS_LB_URI}?loadBalanced=true"
  else
    # If there are query params then append the load balanced option to them.
    SINGLE_MONGOS_LB_URI="${SINGLE_MONGOS_LB_URI}${SUFFIX}&loadBalanced=true"
    MULTI_MONGOS_LB_URI="${MULTI_MONGOS_LB_URI}${SUFFIX}&loadBalanced=true"
  fi

  echo "Single Mongos LB: $SINGLE_MONGOS_LB_URI"
  echo "Multiple Mongos LB: $MULTI_MONGOS_LB_URI"

  haproxy -D -f $DRIVERS_TOOLS/haproxy.conf -p $DRIVERS_TOOLS/haproxy.pid

  echo 'SINGLE_MONGOS_LB_URI: "'$SINGLE_MONGOS_LB_URI'"' > lb-expansion.yml
  echo 'MULTI_MONGOS_LB_URI: "'$MULTI_MONGOS_LB_URI'"' >> lb-expansion.yml
}

stop() {
  echo "Stopping HAProxy..."
  kill -USR1 $(cat $DRIVERS_TOOLS/haproxy.pid)
  rm $DRIVERS_TOOLS/haproxy.conf $DRIVERS_TOOLS/haproxy.pid
}

case "$1" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  *)
    echo "Usage: load-balancer.sh (start|stop)"
    exit 1
esac

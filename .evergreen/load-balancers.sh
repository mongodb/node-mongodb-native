#!/bin/sh

set -o errexit  # Exit the script with error if any of the commands fail

start() {
  echo "Starting HAProxy..."

  cat <<EOF_HAPROXY_CONFIG >> $DRIVERS_TOOLS/haproxy.conf
  defaults
      mode tcp
      timeout connect 5000ms
      timeout client 5000ms
      timeout server 5000ms

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

  PREFIX=$(echo $MONGODB_URI | grep -Eo "(.*?)@")
  SUFFIX=$(echo $MONGODB_URI | grep -Eo "\?(.*)")

  if [ PREFIX = "" ]
  then
    # No auth then just set the URI
    SINGLE_MONGOS_LB_URI="mongodb://127.0.0.1:8000"
    MULTI_MONGOS_LB_URI="mongodb://127.0.0.1:8001"
  else
    # We have auth so append the lb host:port
    SINGLE_MONGOS_LB_URI="${PREFIX}127.0.0.1:8000"
    MULTI_MONGOS_LB_URI="${PREFIX}127.0.0.1:8001"
  fi

  if [ SUFFIX = "" ]
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

  /usr/sbin/haproxy -D -f $DRIVERS_TOOLS/haproxy.conf -p ./haproxy.pid

  export SINGLE_MONGOS_LB_URI="$SINGLE_MONGOS_LB_URI"
  export MULTI_MONGOS_LB_URI="$MULTI_MONGOS_LB_URI"
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

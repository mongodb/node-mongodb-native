#!/bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace  # For debuggability, no external credentials are used here

node -v

PYTHON_BINARY=$(bash -c ". $DRIVERS_TOOLS/.evergreen/find-python3.sh && ensure_python3 2>/dev/null")

# ssl setup
SSL=${SSL:-nossl}
if [ "$SSL" != "nossl" ]; then
   export SSL_KEY_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/client.pem"
   export SSL_CA_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem"
fi

# Grab a connection string that only refers to *one* of the hosts in MONGODB_URI
FIRST_HOST=$(node -p 'new (require("mongodb-connection-string-url").default)(process.env.MONGODB_URI).hosts[0]')
# Use 127.0.0.1:12345 as the URL for the single host that we connect to,
# we configure the Socks5 proxy server script to redirect from this to FIRST_HOST
export MONGODB_URI_SINGLEHOST="mongodb://127.0.0.1:12345/"

# Compute path to socks5 fake server script in a way that works on Windows
SOCKS5_SERVER_SCRIPT="$DRIVERS_TOOLS/.evergreen/socks5srv.py"
if [ "Windows_NT" = "$OS" ]; then
  SOCKS5_SERVER_SCRIPT=$(cygpath -w "$SOCKS5_SERVER_SCRIPT")
fi

# First, test with Socks5 + authentication required
"$PYTHON_BINARY" "$SOCKS5_SERVER_SCRIPT" --port 1080 --auth username:p4ssw0rd --map "127.0.0.1:12345 to $FIRST_HOST" &
SOCKS5_PROXY_PID=$!
if [[ $TEST_SOCKS5_CSFLE == "true" ]]; then
  [ "$SSL" == "nossl" ] && [[ "$OSTYPE" == "linux-gnu"* ]] && \
  env MONGODB_URI='mongodb://127.0.0.1:12345/?proxyHost=127.0.0.1&proxyUsername=username&proxyPassword=p4ssw0rd' \
  bash "${PROJECT_DIRECTORY}/.evergreen/run-custom-csfle-tests.sh"
else
  env SOCKS5_CONFIG='["127.0.0.1",1080,"username","p4ssw0rd"]' npm run check:socks5
fi
kill $SOCKS5_PROXY_PID

# Second, test with Socks5 + no authentication
"$PYTHON_BINARY" "$SOCKS5_SERVER_SCRIPT" --port 1081 --map "127.0.0.1:12345 to $FIRST_HOST" &
SOCKS5_PROXY_PID=$!
if [[ $TEST_SOCKS5_CSFLE == "true" ]]; then
  [ "$SSL" == "nossl" ] && [[ "$OSTYPE" == "linux-gnu"* ]] && \
    env MONGODB_URI='mongodb://127.0.0.1:12345/?proxyHost=127.0.0.1&proxyPort=1081' \
    bash "${PROJECT_DIRECTORY}/.evergreen/run-custom-csfle-tests.sh"
else
  env SOCKS5_CONFIG='["127.0.0.1",1081]' npm run check:socks5
fi
kill $SOCKS5_PROXY_PID

# TODO: It might be worth using something more robust to control
# the Socks5 proxy server script's lifetime

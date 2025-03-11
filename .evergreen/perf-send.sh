#!/usr/bin/env bash

set -euox pipefail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

TARGET_FILE=${TARGET_FILE:-src/test/benchmarks/driver_bench/results.json}

node src/.evergreen/perf_send.mjs $TARGET_FILE

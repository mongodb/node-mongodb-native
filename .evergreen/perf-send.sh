#!/usr/bin/env bash

set -euox pipefail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

TARGET_FILE=$(realpath "${TARGET_FILE:-./test/benchmarks/driver_bench/results.json}")

node ./.evergreen/perf_send.mjs $TARGET_FILE

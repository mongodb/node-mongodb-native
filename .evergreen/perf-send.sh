#!/usr/bin/env bash

set -euo pipefail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

TARGET_FILE=$(realpath "${TARGET_FILE:-./test/benchmarks/driver_bench/results.json}")

set -o xtrace

node ./.evergreen/perf_send.mjs $TARGET_FILE

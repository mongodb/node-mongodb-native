'use strict';

const SECOND_TO_NS = 1e9;
const MINUTE_TO_MS = 60 * 1e3;
const FIVE_MINUTES_TO_MS = MINUTE_TO_MS * 5;

function parseIntOrDefault(val, def) {
  if (!val) {
    return def;
  }

  const parsed = Number.parseInt(val, 10);
  return parsed ? parsed : def;
}

const DEFAULT_MIN_EXECUTION_TIME = parseIntOrDefault(
  process.env.DRIVER_BENCH_MIN_EX_TIME,
  MINUTE_TO_MS
);
const DEFAULT_MAX_EXECUTION_TIME = parseIntOrDefault(
  process.env.DRIVER_BENCH_MAX_EX_TIME,
  FIVE_MINUTES_TO_MS
);
const DEFAULT_MIN_EXECUTION_COUNT = parseIntOrDefault(process.env.DRIVER_BENCH_MIN_EX_COUNT, 100);

module.exports = {
  SECOND_TO_NS,
  DEFAULT_MIN_EXECUTION_COUNT,
  DEFAULT_MIN_EXECUTION_TIME,
  DEFAULT_MAX_EXECUTION_TIME
};

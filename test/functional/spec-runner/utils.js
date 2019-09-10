'use strict';
const environments = require('../../../test-runner/environments');

function resolveConnectionString(configuration, spec) {
  const isShardedEnvironment = configuration.environment instanceof environments.sharded;
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;

  return isShardedEnvironment && !useMultipleMongoses
    ? `mongodb://${configuration.host}:${configuration.port}/${configuration.db}`
    : configuration.url();
}

module.exports = { resolveConnectionString };

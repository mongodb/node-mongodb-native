'use strict';

function resolveConnectionString(configuration, spec) {
  const isShardedEnvironment = configuration.topologyType === 'Sharded';
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;

  return isShardedEnvironment && !useMultipleMongoses
    ? `mongodb://${configuration.host}:${configuration.port}/${configuration.db}`
    : configuration.url();
}

module.exports = { resolveConnectionString };

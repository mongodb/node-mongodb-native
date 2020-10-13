'use strict';

function resolveConnectionString(configuration, opts) {
  const isShardedEnvironment = configuration.topologyType === 'Sharded';
  const useMultipleMongoses = opts && !!opts.useMultipleMongoses;

  return isShardedEnvironment && !useMultipleMongoses
    ? `mongodb://${configuration.host}:${configuration.port}/${configuration.db}?directConnection=false`
    : configuration.url(opts.user, opts.password);
}

module.exports = { resolveConnectionString };

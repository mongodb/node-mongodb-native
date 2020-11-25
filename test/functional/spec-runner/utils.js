'use strict';

function resolveConnectionString(configuration, spec, context) {
  const isShardedEnvironment = configuration.topologyType === 'Sharded';
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;
  const user = context && context.user;
  const password = context && context.password;
  const connectionString =
    isShardedEnvironment && !useMultipleMongoses
      ? `mongodb://${configuration.host}:${configuration.port}/${configuration.db}?directConnection=false`
      : configuration.url(user, password);
  return connectionString;
}

module.exports = { resolveConnectionString };

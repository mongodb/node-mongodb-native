'use strict';

function resolveConnectionString(configuration, spec, context) {
  const isShardedEnvironment = configuration.topologyType === 'Sharded';
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;
  const username = context && context.user;
  const password = context && context.password;
  const authSource = context && context.authSource;
  const connectionString =
    isShardedEnvironment && !useMultipleMongoses
      ? `mongodb://${configuration.host}:${configuration.port}/${
          configuration.db
        }?directConnection=false${authSource ? `&authSource=${authSource}` : ''}`
      : configuration.url({ username, password, authSource });
  return connectionString;
}

module.exports = { resolveConnectionString };

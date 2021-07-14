'use strict';

function resolveConnectionString(configuration, spec, context) {
  const isShardedEnvironment = configuration.topologyType === 'Sharded';
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;
  let username = context && context.user;
  let password = context && context.password;
  let authSource = context && context.authSource;
  if (process.env.SERVERLESS) {
    username = process.env.SERVERLESS_ATLAS_USER;
    password = process.env.SERVERLESS_ATLAS_PASSWORD;
    authSource = 'admin';
  }
  const connectionString =
    isShardedEnvironment && !useMultipleMongoses
      ? `mongodb://${configuration.host}:${configuration.port}/${
          configuration.db
        }?directConnection=false${authSource ? `&authSource=${authSource}` : ''}`
      : configuration.url({ username, password, authSource });
  return connectionString;
}

module.exports = { resolveConnectionString };

'use strict';

function getIndicesOfAuthInUrl(connectionString) {
  const doubleSlashIndex = connectionString.indexOf('//');
  const atIndex = connectionString.indexOf('@');

  if (doubleSlashIndex === -1 || atIndex === -1) {
    return null;
  }

  return {
    start: doubleSlashIndex + 2,
    end: atIndex
  };
}

function extractAuthString(connectionString) {
  const indices = getIndicesOfAuthInUrl(connectionString);
  if (!indices) {
    return null;
  }

  return connectionString.slice(indices.start, indices.end);
}

function resolveConnectionString(configuration, spec, context) {
  const isShardedEnvironment = configuration.topologyType === 'Sharded';
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;
  const username = context && context.user;
  const password = context && context.password;
  const authSource = (context && context.authSource) || 'admin';
  const authString =
    process.env.AUTH === 'auth' ? `${extractAuthString(process.env.MONGODB_URI)}@` : '';
  const connectionString =
    isShardedEnvironment && !useMultipleMongoses
      ? `mongodb://${authString}${configuration.host}:${configuration.port}/${configuration.db}?directConnection=false&authSource=${authSource}`
      : configuration.url({ username, password, authSource });
  return connectionString;
}

module.exports = { resolveConnectionString, getIndicesOfAuthInUrl, extractAuthString };

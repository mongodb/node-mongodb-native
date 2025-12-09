'use strict';

const process = require('node:process');
const { extractAuthFromConnectionString } = require('../utils');

function resolveConnectionString(configuration, spec, context) {
  const isShardedEnvironment = configuration.topologyType === 'Sharded';
  const useMultipleMongoses = spec && !!spec.useMultipleMongoses;
  const username = context && context.user;
  const password = context && context.password;
  const authSource = (context && context.authSource) || 'admin';
  const authString =
    process.env.AUTH === 'auth'
      ? `${extractAuthFromConnectionString(process.env.MONGODB_URI)}@`
      : '';
  const connectionString =
    isShardedEnvironment && !useMultipleMongoses
      ? `mongodb://${authString}${configuration.host}:${configuration.port}/${configuration.db}?directConnection=false&authSource=${authSource}`
      : configuration.url({ username, password, authSource });
  return connectionString;
}

module.exports = { resolveConnectionString };

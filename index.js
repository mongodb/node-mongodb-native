module.exports = {
    MongoError: require('./lib/error')
  , Server: require('./lib/topologies/server')
  , ReplSet: require('./lib/topologies/replset')
  , Mongos: require('./lib/topologies/mongos')
  , Logger: require('./lib/connection/logger')
  , Cursor: require('./lib/cursor')
  , ReadPreference: require('./lib/topologies/read_preference')
  , BSON: require('bson')
  // Raw operations
  , Query: require('./lib/connection/commands').Query
  // Tools exported for testing
  , ServerManager: require('./lib/tools/server_manager')
  , ReplSetManager: require('./lib/tools/replset_manager')
  , MongosManager: require('./lib/tools/mongos_manager')
  , ShardingManager: require('./lib/tools/sharding_manager')
  // Auth mechanisms
  , MongoCR: require('./lib/auth/mongocr')
  , X509: require('./lib/auth/x509')
  , Plain: require('./lib/auth/plain')
  , GSSAPI: require('./lib/auth/gssapi')
}
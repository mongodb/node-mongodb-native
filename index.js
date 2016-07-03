// module.exports = {
//     MongoError: require('./lib/error')
//   , Server: require('./lib/topologies/server')
//   , ReplSet: require('./lib/topologies/replset')
//   , Mongos: require('./lib/topologies/mongos')
//   , Logger: require('./lib/connection/logger')
//   , Cursor: require('./lib/cursor')
//   , ReadPreference: require('./lib/topologies/read_preference')
//   , BSON: require('bson')
//   // Raw operations
//   , Query: require('./lib/connection/commands').Query
//   // Auth mechanisms
//   , MongoCR: require('./lib/auth/mongocr')
//   , X509: require('./lib/auth/x509')
//   , Plain: require('./lib/auth/plain')
//   , GSSAPI: require('./lib/auth/gssapi')
//   , ScramSHA1: require('./lib/auth/scram')
// }

module.exports = {
    MongoError: require('./lib/error')
  , Connection: require('./lib/connection/connection')
  , Server: require('./lib/topologies/server')
  , ReplSet: require('./lib/topologies/replset')
  , Mongos: require('./lib/topologies/mongos')
  , Logger: require('./lib/connection/logger')
  , Cursor: require('./lib/cursor')
  , ReadPreference: require('./lib/topologies/read_preference')
  , BSON: require('bson')
  // Raw operations
  , Query: require('./lib/connection/commands').Query
  // Auth mechanisms
  , MongoCR: require('./lib/auth/mongocr')
  , X509: require('./lib/auth/x509')
  , Plain: require('./lib/auth/plain')
  , GSSAPI: require('./lib/auth/gssapi')
  , ScramSHA1: require('./lib/auth/scram')
}

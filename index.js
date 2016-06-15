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
    MongoError: require('./lib2/error')
  , Server: require('./lib2/topologies/server')
  , ReplSet: require('./lib/topologies/replset')
  , Mongos: require('./lib/topologies/mongos')
  , Logger: require('./lib2/connection/logger')
  , Cursor: require('./lib2/cursor')
  , ReadPreference: require('./lib2/topologies/read_preference')
  , BSON: require('bson')
  // Raw operations
  , Query: require('./lib2/connection/commands').Query
  // Auth mechanisms
  , MongoCR: require('./lib2/auth/mongocr')
  , X509: require('./lib2/auth/x509')
  , Plain: require('./lib2/auth/plain')
  , GSSAPI: require('./lib2/auth/gssapi')
  , ScramSHA1: require('./lib2/auth/scram')
}

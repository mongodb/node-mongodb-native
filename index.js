var BSON = require('bson');

try {
  // try { BSON = require('bson-ext'); } catch(err) {
    BSON = require_optional('bson-ext');
  // }
} catch(err) {}

module.exports = {
    MongoError: require('./lib/error')
  , Connection: require('./lib/connection/connection')
  , Server: require('./lib/topologies/server')
  , ReplSet: require('./lib/topologies/replset')
  , Mongos: require('./lib/topologies/mongos')
  , Logger: require('./lib/connection/logger')
  , Cursor: require('./lib/cursor')
  , ReadPreference: require('./lib/topologies/read_preference')
  , BSON: BSON
  // Raw operations
  , Query: require('./lib/connection/commands').Query
  // Auth mechanisms
  , MongoCR: require('./lib/auth/mongocr')
  , X509: require('./lib/auth/x509')
  , Plain: require('./lib/auth/plain')
  , GSSAPI: require('./lib/auth/gssapi')
  , ScramSHA1: require('./lib/auth/scram')
}

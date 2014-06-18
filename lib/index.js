module.exports = {
    MongoError: require('./error')
  , Server: require('./topologies/server')
  , ReplSet: require('./topologies/replset')
  , Mongos: require('./topologies/mongos')
  , MongoCR: require('./auth/mongocr')
  , Logger: require('./connection/logger')
  , ReadPreference: require('./topologies/read_preference')
}
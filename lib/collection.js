var checkCollectionName = require('./utils').checkCollectionName
  , ObjectID = require('mongodb-core').BSON.ObjectID
  , f = require('util').format

var Collection = function(db, topology, databaseName, collectionName, pkFactory, options) {  
  checkCollectionName(collectionName);

  // Unpack variables
  var internalHint = null;
  var opts = options != null && ('object' === typeof options) ? options : {};
  var slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  var serializeFunctions = options == null || options.serializeFunctions == null ? db.serializeFunctions : options.serializeFunctions;
  var raw = options == null || options.raw == null ? db.raw : options.raw;
  var readPreference = null;

  // Assign the right collection level readPreference
  if(options && options.readPreference) {
    readPreference = options.readPreference;
  } else if(db.options.readPreference) {
    readPreference = db.options.readPreference;
  } else if(db.serverConfig.options.readPreference) {
    readPreference = db.serverConfig.options.readPreference;
  }

  // Set custom primary key factory if provided
  pkFactory = pkFactory == null
    ? ObjectID
    : pkFactory;

  // // Server Capabilities
  // this.serverCapabilities = this.db.serverConfig._serverCapabilities;

  this.insert = function(docs, options, callback) {
    docs = Array.isArray(docs) ? docs : [docs];
    if(typeof options == 'function') callback = options, options = {};
    // File inserts
    topology.insert(f("%s.%s", databaseName, collectionName), docs, options, function(err, result) {
      if(err) return callback(err);      
    });
  }
}

module.exports = Collection;
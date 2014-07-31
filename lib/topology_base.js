var MongoError = require('mongodb-core').MongoError
  , f = require('util').format;

// The store of ops
var Store = function() {
  var storedOps = [];

  this.add = function(opType, ns, ops, options, force, max, sOptions, callback) {    
    if(force) return callback(new MongoError("db closed by application"));
    if(max == 0) return callback(new MongoError(f("no connection available for operation and number of stored operation > %s", max)));
    if(max > 0 && storedOps.length > max) {
      while(storedOps.length > 0) {
        var op = storedOps.shift();
        op.c(new MongoError(f("no connection available for operation and number of stored operation > %s", max)));
      }

      return;
    }

    storedOps.push({t: opType, n: ns, o: ops, op: options, c: callback})
  }

  this.flush = function() {
    while(storedOps.length > 0) {
      var op = storedOps.shift();
      op.c(new MongoError(f("no connection available for operation")));
    }
  }

  this.all = function() {
    return storedOps;
  }
}

// Server capabilities
var ServerCapabilities = function(ismaster) {
  var setup_get_property = function(object, name, value) {
    Object.defineProperty(object, name, {
        enumerable: true
      , get: function () { return value; }
    });  
  }

  // Capabilities
  var aggregationCursor = false;
  var writeCommands = false;
  var textSearch = false;
  var authCommands = false;
  var maxNumberOfDocsInBatch = ismaster.maxWriteBatchSize || 1000;

  if(ismaster.minWireVersion >= 0) {
    textSearch = true;
  }

  if(ismaster.maxWireVersion >= 1) {
    aggregationCursor = true;
    authCommands = true;
  }

  if(ismaster.maxWireVersion >= 2) {
    writeCommands = true;
  }

  // If no min or max wire version set to 0
  if(ismaster.minWireVersion == null) {
    ismaster.minWireVersion = 0;
  }

  if(ismaster.maxWireVersion == null) {
    ismaster.maxWireVersion = 0;
  }

  // Map up read only parameters
  setup_get_property(this, "hasAggregationCursor", aggregationCursor);
  setup_get_property(this, "hasWriteCommands", writeCommands);
  setup_get_property(this, "hasTextSearch", textSearch);
  setup_get_property(this, "hasAuthCommands", authCommands);
  setup_get_property(this, "minWireVersion", ismaster.minWireVersion);
  setup_get_property(this, "maxWireVersion", ismaster.maxWireVersion);
  setup_get_property(this, "maxNumberOfDocsInBatch", maxNumberOfDocsInBatch);
}

exports.Store = Store;
exports.ServerCapabilities = ServerCapabilities;
"use strict";

var MongoError = require('mongodb-core').MongoError
  , f = require('util').format;

// The store of ops
var Store = function(topology, storeOptions) {
  var self = this;
  var storedOps = [];
  storeOptions = storeOptions || {force:false, bufferMaxEntries: -1}

  // Internal state
  this.s = {
      storedOps: storedOps
    , storeOptions: storeOptions
    , topology: topology
  }

  Object.defineProperty(this, 'length', {
    enumerable:true, get: function() { return self.s.storedOps.length; }
  });
}

Store.prototype.add = function(opType, ns, ops, options, callback) {
  if(this.s.storeOptions.force) {
    return callback(MongoError.create({message: "db closed by application", driver:true}));
  }

  if(this.s.storeOptions.bufferMaxEntries == 0) {
    return callback(MongoError.create({message: f("no connection available for operation and number of stored operation > %s", this.s.storeOptions.bufferMaxEntries), driver:true }));
  }

  if(this.s.storeOptions.bufferMaxEntries > 0 && this.s.storedOps.length > this.s.storeOptions.bufferMaxEntries) {
    while(this.s.storedOps.length > 0) {
      var op = this.s.storedOps.shift();
      op.c(MongoError.create({message: f("no connection available for operation and number of stored operation > %s", this.s.storeOptions.bufferMaxEntries), driver:true }));
    }

    return;
  }

  this.s.storedOps.push({t: opType, n: ns, o: ops, op: options, c: callback})
}

Store.prototype.addObjectAndMethod = function(opType, object, method, params, callback) {
  if(this.s.storeOptions.force) {
    return callback(MongoError.create({message: "db closed by application", driver:true }));
  }

  if(this.s.storeOptions.bufferMaxEntries == 0) {
    return callback(MongoError.create({message: f("no connection available for operation and number of stored operation > %s", this.s.storeOptions.bufferMaxEntries), driver:true }));
  }

  if(this.s.storeOptions.bufferMaxEntries > 0 && this.s.storedOps.length > this.s.storeOptions.bufferMaxEntries) {
    while(this.s.storedOps.length > 0) {
      var op = this.s.storedOps.shift();
      op.c(MongoError.create({message: f("no connection available for operation and number of stored operation > %s", this.s.storeOptions.bufferMaxEntries), driver:true }));
    }

    return;
  }

  this.s.storedOps.push({t: opType, m: method, o: object, p: params, c: callback})
}

Store.prototype.flush = function(err) {
  while(this.s.storedOps.length > 0) {
    this.s.storedOps.shift().c(err || MongoError.create({message: f("no connection available for operation"), driver:true }));
  }
}

Store.prototype.execute = function() {
  // Get current ops
  var ops = this.s.storedOps;
  // Reset the ops
  this.s.storedOps = [];

  // Execute all the stored ops
  while(ops.length > 0) {
    var op = ops.shift();

    // console.log("======= execute op")
    // console.dir(op)

    if(op.t == 'cursor') {
      op.o[op.m].apply(op.o, op.p);
    } else if(op.t == 'auth') {
      this.s.topology[op.t].apply(this.s.topology, op.o);
    } else {
      this.s.topology[op.t](op.n, op.o, op.op, op.c);
    }
  }
}

Store.prototype.all = function() {
  return this.s.storedOps;
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
  var listCollections = false;
  var listIndexes = false;
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

  if(ismaster.maxWireVersion >= 3) {
    listCollections = true;
    listIndexes = true;
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
  setup_get_property(this, "hasListCollectionsCommand", listCollections);
  setup_get_property(this, "hasListIndexesCommand", listIndexes);
  setup_get_property(this, "minWireVersion", ismaster.minWireVersion);
  setup_get_property(this, "maxWireVersion", ismaster.maxWireVersion);
  setup_get_property(this, "maxNumberOfDocsInBatch", maxNumberOfDocsInBatch);
}

exports.Store = Store;
exports.ServerCapabilities = ServerCapabilities;

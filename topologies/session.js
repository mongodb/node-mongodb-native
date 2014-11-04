var inherits = require('util').inherits
  , f = require('util').format
  , EventEmitter = require('events').EventEmitter;

/**
 * Creates a new Authentication Session
 * @class
 * @param {object} [options] Options for the session
 * @param {{Server}|{ReplSet}|{Mongos}} topology The topology instance underpinning the session
 */
var Session = function(options, topology) {
  this.options = options;
  this.topology = topology;
  
  // Add event listener
  EventEmitter.call(this);
}

inherits(Session, EventEmitter);

/**
 * Execute a command
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {object} cmd The command hash
 * @param {object} [options.readPreference] Specify read preference if command supports it
 * @param {object} [options.connection] Specify connection object to execute command against
 * @param {opResultCallback} callback A callback function
 */
Session.prototype.command = function(ns, cmd, options, callback) {
  this.topology.command(ns, cmd, options, callback);
}

/**
 * Insert one or more documents
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of documents to insert
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {opResultCallback} callback A callback function
 */
Session.prototype.insert = function(ns, ops, options, callback) {
  this.topology.insert(ns, ops, options, callback);
}

/**
 * Perform one or more update operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of updates
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {opResultCallback} callback A callback function
 */
Session.prototype.update = function(ns, ops, options, callback) {
  this.topology.update(ns, ops, options, callback);
}

/**
 * Perform one or more remove operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {array} ops An array of removes
 * @param {boolean} [options.ordered=true] Execute in order or out of order
 * @param {object} [options.writeConcern={}] Write concern for the operation
 * @param {opResultCallback} callback A callback function
 */
Session.prototype.remove = function(ns, ops, options, callback) {
  this.topology.remove(ns, ops, options, callback);
}

/**
 * Perform one or more remove operations
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {{object}|{Long}} cmd Can be either a command returning a cursor or a cursorId
 * @param {object} [options.batchSize=0] Batchsize for the operation
 * @param {array} [options.documents=[]] Initial documents list for cursor
 * @param {boolean} [options.tailable=false] Tailable flag set
 * @param {boolean} [options.oplogReply=false] oplogReply flag set
 * @param {boolean} [options.awaitdata=false] awaitdata flag set
 * @param {boolean} [options.exhaust=false] exhaust flag set
 * @param {boolean} [options.partial=false] partial flag set
 * @param {opResultCallback} callback A callback function
 */
Session.prototype.cursor = function(ns, cmd, options) {
  return this.topology.cursor(ns, cmd, options);
}  

module.exports = Session;
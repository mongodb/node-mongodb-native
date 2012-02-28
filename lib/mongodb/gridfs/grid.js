var GridStore = require('./gridstore').GridStore,
  ObjectID = require('../bson/objectid').ObjectID;

/**
 * A class representation of a simple Grid interface.
 *
 * @class Represents the Grid.
 * @param {Db} db A database instance to interact with.
 * @param {String} [fsName] optional different root collection for GridFS.
 * @return {Grid}
 */
function Grid(db, fsName) {

  if(!(this instanceof Grid)) return new Grid(db, fsName);
  
  this.db = db;
  this.fsName = fsName == null ? GridStore.DEFAULT_ROOT_COLLECTION : fsName;
} 

/**
 * Puts binary data to the grid
 *
 * @param {Buffer} data buffer with Binary Data.
 * @param {Object} [options] the options for the files.
 * @callback {Function} this will be called after this method is executed. The first parameter will contain an Error object if an error occured or null otherwise. The second parameter will contain a reference to this object.
 * @return {null}
 * @api public
 */
Grid.prototype.put = function(data, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  // If root is not defined add our default one
  options['root'] = options['root'] == null ? this.fsName : options['root'];
    
  // Return if we don't have a buffer object as data
  if(!(Buffer.isBuffer(data))) return callback(new Error("Data object must be a buffer object"), null);    
  // Get filename if we are using it
  var filename = options['filename'];
  // Create gridstore
  var gridStore = new GridStore(this.db, filename, "w", options);
  gridStore.open(function(err, gridStore) {
    if(err) return callback(err, null);

    gridStore.write(data, function(err, result) {
      if(err) return callback(err, null);

      gridStore.close(function(err, result) {
        if(err) return callback(err, null);
        callback(null, result);
      })
    })            
  })
}

/**
 * Get binary data to the grid
 *
 * @param {ObjectID} id ObjectID for file.
 * @callback {Function} this will be called after this method is executed. The first parameter will contain an Error object if an error occured or null otherwise. The second parameter will contain a reference to this object.
 * @return {null}
 * @api public
 */
Grid.prototype.get = function(id, callback) {
  // Validate that we have a valid ObjectId
  if(!(id instanceof ObjectID)) return callback(new Error("Not a valid ObjectID", null));  
  // Create gridstore
  var gridStore = new GridStore(this.db, id, "r", {root:this.fsName});
  gridStore.open(function(err, gridStore) {
    if(err) return callback(err, null);
    
    // Return the data
    gridStore.read(function(err, data) {
      return callback(err, data)
    });  
  })
}

/**
 * Delete file from grid
 *
 * @param {ObjectID} id ObjectID for file.
 * @callback {Function} this will be called after this method is executed. The first parameter will contain an Error object if an error occured or null otherwise. The second parameter will contain a reference to this object.
 * @return {null}
 * @api public
 */
Grid.prototype.delete = function(id, callback) {
  // Validate that we have a valid ObjectId
  if(!(id instanceof ObjectID)) return callback(new Error("Not a valid ObjectID", null));  
  // Create gridstore
  GridStore.unlink(this.db, id, {root:this.fsName}, function(err, result) {
    if(err) return callback(err, false);
    return callback(null, true);
  });
}

exports.Grid = Grid;

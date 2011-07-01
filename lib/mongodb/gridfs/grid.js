var GridStore = require('./gridstore').GridStore,
  debug = require('util').debug,
  inspect = require('util').inspect;

/**
 * Simple Grid interface
 *
 */
var Grid = exports.Grid = function(db, fsName) {
  this.db = db;
  this.fsName = fsName == null ? GridStore.DEFAULT_ROOT_COLLECTION : fsName;
} 

/**
 * Puts binary data to the grid
 *
 * @param data Buffer with Binary Data
 * @param options {object=} opt_argument The options for the files.
 * @callback {function(?Error, GridStore)} This will be called after this method
 *     is executed. The first parameter will contain an Error object if an error
 *     occured or null otherwise. The second parameter will contain a reference
 *     to this object.
 *
 */
Grid.prototype.put = function(data, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};  
  
  // Get filename if we are using it
  var filename = options['filename'];
  // Create gridstore
  var gridStore = new GridStore(this.db, filename, "w", options);
  gridStore.open(function(err, gridStore) {
    if(err) return callback(err, null);

    if(data instanceof Buffer) {
      gridStore.writeBuffer(data, function(err, result) {
        if(err) return callback(err, null);

        gridStore.close(function(err, result) {
          if(err) return callback(err, null);
          callback(null, result);
        })
      })            
    } else {
      gridStore.write(data, function(err, result) {
        if(err) return callback(err, null);

        gridStore.close(function(err, result) {
          if(err) return callback(err, null);
          callback(null, result);
        })
      })      
    }    
  })
}

/**
 * Get binary data to the grid
 *
 * @param id ObjectID for file
 * @callback {function(?Error, GridStore)} This will be called after this method
 *     is executed. The first parameter will contain an Error object if an error
 *     occured or null otherwise. The second parameter will contain a reference
 *     to this object.
 *
 */
Grid.prototype.get = function(id, callback) {
  // Create gridstore
  var gridStore = new GridStore(this.db, id, "r", {});
  gridStore.open(function(err, gridStore) {
    if(err) return callback(err, null);

    // Return the data
    gridStore.readBuffer(function(err, data) {
      return callback(null, data)
    });  
  })
}

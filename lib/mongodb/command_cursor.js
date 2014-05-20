var Long = require('bson').Long
  , Readable = require('stream').Readable || require('readable-stream').Readable
  , GetMoreCommand = require('./commands/get_more_command').GetMoreCommand
  , inherits = require('util').inherits;

var CommandCursor = function(db, collection, command, options) {  
  // Ensure empty options if no options passed
  options = options || {};  
  
  // Set up
  Readable.call(this, {objectMode: true});

  // Default cursor id is 0
  var cursorId = options.cursorId || Long.fromInt(0);
  var zeroCursor = Long.fromInt(0);
  var state = 'init';
  var batchSize = options.batchSize || 0;

  // Hardcode batch size
  if(command && command.cursor) {
    command.cursor.batchSize = 1;
    batchSize = command.cursor.batchSize || 0;
  }

  // BatchSize
  var raw = options.raw || false;
  var readPreference = options.readPreference || 'primary';

  // Checkout a connection
  var connection = db.serverConfig.checkoutReader(readPreference);
  // MaxTimeMS
  var maxTimeMS = options.maxTimeMS;

  // Contains all the items
  var items = options.items || null;

  // Execute getmore
  var getMore = function(callback) {
    // Resolve more of the cursor using the getMore command
    var getMoreCommand = new GetMoreCommand(db
      , db.databaseName + "." + collection.collectionName
      , batchSize
      , cursorId
    );

    // Set up options
    var command_options = { connection:connection };

    // Execute the getMore Command
    db._executeQueryCommand(getMoreCommand, command_options, function(err, result) {
      if(err) {
        items = [];
        state = 'closed';
        return callback(err);
      }

      // Return all the documents
      callback(null, result);
    });    
  }

  var exhaustGetMore = function(callback) {
    getMore(function(err, result) {
      if(err) {
        items = [];
        state = 'closed';
        return callback(err, null);
      }

      // Add the items
      items = items.concat(result.documents);      

      // Set the cursor id
      cursorId = result.cursorId;
      if(typeof cursorId == 'number') cursorId = Long.fromNumber(cursorId);
      
      // If the cursor is done
      if(result.cursorId.equals(zeroCursor)) {
        return callback(null, items);
      } 

      // Check the cursor id
      exhaustGetMore(callback);
    });
  }

  var exhaustGetMoreEach = function(callback) {
    getMore(function(err, result) {
      if(err) {
        items = [];
        state = 'closed';
        return callback(err, null);
      }

      // Add the items
      items = result.documents;

      // Emit all the items in the first batch
      while(items.length > 0) {
        callback(null, items.shift());
      }
      
      // Set the cursor id
      cursorId = result.cursorId;
      if(typeof cursorId == 'number') cursorId = Long.fromNumber(cursorId);

      // If the cursor is done
      if(result.cursorId.equals(zeroCursor)) {
        state = "closed";
        return callback(null, null);
      } 
      
      // Check the cursor id
      exhaustGetMoreEach(callback);
    });
  }

  //
  // Get all the elements
  //
  this.get = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // Set the connection to the passed in one if it's provided
    connection = options.connection ? options.connection : connection;

    // Command options
    var _options = {connection:connection};
    if(typeof maxTimeMS == 'number') _options.maxTimeMS = maxTimeMS;

    // If we have a cursor Id already not equal to 0 we are just going to
    // exhaust the cursor
    if(cursorId.notEquals(zeroCursor)) {
      // If no items set an empty array
      items = items || [];
      // Exhaust the cursor
      return exhaustGetMore(callback);
    }

    // Execute the internal command first
    db.command(command, _options, function(err, result) {
      if(err) {
        state = 'closed';
        return callback(err, null);
      }

      // Retrieve the cursor id
      cursorId = result.cursor.id;
      if(typeof cursorId == 'number') cursorId = Long.fromNumber(cursorId);

      // Validate cursorId
      if(cursorId.equals(zeroCursor)) {
        return callback(null, result.cursor.firstBatch);
      };

      // Add to the items
      items = result.cursor.firstBatch;
      // Execute the getMore
      exhaustGetMore(callback);
    });
  }

  //
  // Iterate over all the items
  //
  this.each = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // If it's a closed cursor return error
    if(this.isClosed()) return callback(new Error("cursor is closed"));
    // Set the connection to the passed in one if it's provided
    connection = options.connection ? options.connection : connection;
  
    // Command options
    var _options = {connection:connection};
    if(typeof maxTimeMS == 'number') _options.maxTimeMS = maxTimeMS;

    // If we have a cursor Id already not equal to 0 we are just going to
    // exhaust the cursor
    if(cursorId.notEquals(zeroCursor)) {
      // If no items set an empty array
      items = items || [];

      // Emit all the items in the first batch
      while(items.length > 0) {
        callback(null, items.shift());
      }

      // Exhaust the cursor
      return exhaustGetMoreEach(callback);
    }

    // Execute the internal command first
    db.command(command, _options, function(err, result) {
      if(err) {
        state = 'closed';
        return callback(err, null);
      }

      // Get all the items
      items = result.cursor.firstBatch;

      // Emit all the items in the first batch
      while(items.length > 0) {
        callback(null, items.shift());
      }

      // Retrieve the cursor id
      cursorId = result.cursor.id;
      if(typeof cursorId == 'number') cursorId = Long.fromNumber(cursorId);

      // If no cursor we just finish up the current batch of items
      if(cursorId.equals(zeroCursor)) {
        state = 'closed';        
        return callback(null, null);
      }

      // Emit each until no more getMore's
      exhaustGetMoreEach(callback);
    });
  }

  //
  // Get the next object
  //
  this.next = function(options, callback) {
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // If it's a closed cursor return error
    if(this.isClosed()) return callback(new Error("cursor is closed"));

    // Set the connection to the passed in one if it's provided
    connection = options.connection ? options.connection : connection;
  
    // Command options
    var _options = {connection:connection};
    if(typeof maxTimeMS == 'number') _options.maxTimeMS = maxTimeMS;

    // If we have a cursor Id already not equal to 0 we are just going to
    // going to bypass the command execution
    if(cursorId.notEquals(zeroCursor)) {
      items = items || [];
    }    

    // Execute the internal command first
    if(!items) {
      db.command(command, _options, function(err, result) {
        if(err) {
          state = 'closed';
          return callback(err, null);
        }

        // Retrieve the cursor id
        cursorId = result.cursor.id;
        if(typeof cursorId == 'number') cursorId = Long.fromNumber(cursorId);
        // Get the first batch results
        items = result.cursor.firstBatch;
        // We have items return the first one
        if(items.length > 0) {
          callback(null, items.shift());
        } else {
          state = 'closed';
          callback(null, null);
        }
      });
    } else if(items.length > 0) {
      callback(null, items.shift());
    } else if(items.length == 0 && cursorId.equals(zeroCursor)) {
      state = 'closed';
      callback(null, null);
    } else {
      // Execute a getMore
      getMore(function(err, result) {
        if(err) {
          state = 'closed';
          return callback(err, null);
        }

        // Set the cursor id
        cursorId = result.cursorId;
        if(typeof cursorId == 'number') cursorId = Long.fromNumber(cursorId);

        // Add the items
        items = items.concat(result.documents);
        // If no more items
        if(items.length == 0) {
          state = 'closed';
          return callback(null, null);
        }

        // Return the item
        return callback(null, items.shift());
      })
    }
  }

  // Validate if the cursor is closed
  this.isClosed = function() {
    return state == 'closed';
  }

  // Allow us to set the MaxTimeMS
  this.maxTimeMS = function(_maxTimeMS) {
    maxTimeMS = _maxTimeMS;
  }

  // Close the cursor sending a kill cursor command if needed
  this.close = function(callback) {
    // Close the cursor if not needed
    if(cursorId instanceof Long && cursorId.greaterThan(Long.fromInt(0))) {
      try {
        var command = new KillCursorCommand(this.db, [cursorId]);
        // Added an empty callback to ensure we don't throw any null exceptions
        db._executeQueryCommand(command, {connection:connection});
      } catch(err) {}
    }

    // Null out the connection
    connection = null;
    // Reset cursor id
    cursorId = Long.fromInt(0);
    // Set to closed status
    state = 'closed';
    // Clear out all the items
    items = null;

    if(callback) {
      callback(null, null);
    }    
  }

  //
  // Stream method
  //
  this._read = function(n) {
    var self = this;
    // Read the next command cursor doc
    self.next(function(err, result) {
      if(err) {
        self.emit('error', err);
        return self.push(null);
      }

      self.push(result);
    });
  }
}

// Inherit from Readable
if(Readable != null) {
  inherits(CommandCursor, Readable);  
}

exports.CommandCursor = CommandCursor;
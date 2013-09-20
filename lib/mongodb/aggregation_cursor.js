var ReadPreference = require('./connection/read_preference').ReadPreference
	, Readable = require('stream').Readable
	, CommandCursor = require('./command_cursor').CommandCursor
	, inherits = require('util').inherits;

var AggregationCursor = function(collection, serverCapabilities) {	
	var pipe = [];
	var self = this;
	var results = null;	
	
	// Set up
	Readable.call(this, {objectMode: true});

	// Contains connection
	var connection = null;

	// Set the read preference
	var _options = { 
		readPreference: ReadPreference.PRIMARY 
	};

	// Cursor options
	var _cursor_options = {};
	
	// Command cursor (if we support one)
	var commandCursor = new CommandCursor(collection.db, collection, {
			aggregate: collection.collectionName
		, pipeline: pipe
		, cursor: _cursor_options
	})

	// Internal cursor methods
	this.find = function(selector) {
		pipe.push({$match: selector});
		return self;
	}

	this.unwind = function(unwind) {
		pipe.push({$unwind: unwind});
		return self;
	}

	this.group = function(group) {
		pipe.push({$group: group});
		return self;
	}

	this.project = function(project) {
		pipe.push({$project: project});
		return self;
	}

	this.limit = function(limit) {
		pipe.push({$limit: limit});
		return self;
	}

	this.geoNear = function(geoNear) {
		pipe.push({$geoNear: geoNear});
		return self;
	}

	this.sort = function(sort) {
		pipe.push({$sort: sort});
		return self;
	}

	this.withReadPreference = function(read_preference) {
		_options.readPreference = read_preference;
		return self;
	}

	this.withQueryOptions = function(options) {
		if(options.batchSize) {
			_cursor_options.batchSize = options.batchSize;
		}

		// Return the cursor
		return self;
	}

	this.skip = function(skip) {
		pipe.push({$skip: skip});
		return self;
	}

	this.explain = function(callback) {
		// Add explain options
		_options.explain = true;
		// Execute aggregation pipeline
		collection.aggregate(pipe, _options, function(err, results) {
			if(err) return callback(err, null);
			callback(null, results);
		});
	}

	this.get = function(callback) {
	  // Checkout a connection
	  var _connection = collection.db.serverConfig.checkoutReader(_options.readPreference);
	  // Fall back
		if(!_connection.serverCapabilities.hasAggregationCursor) {
			return collection.aggregate(pipe, _options, function(err, results) {
				if(err) return callback(err);
				callback(null, results);
			});			
		}

		// Execute get using command Cursor
		commandCursor.get({connection: _connection}, callback);
	}

	this.getOne = function(callback) {
		// Set the limit to 1
		pipe.push({$limit: 1});
		// For now we have no cursor command so let's just wrap existing results
		collection.aggregate(pipe, _options, function(err, results) {
			if(err) return callback(err);
			callback(null, results[0]);
		});
	}

	this.each = function(callback) {
	  // Checkout a connection if we have none
	  if(!connection)
	  	connection = collection.db.serverConfig.checkoutReader(_options.readPreference);
	  
	  // Fall back
		if(!connection.serverCapabilities.hasAggregationCursor) {
			collection.aggregate(pipe, _options, function(err, _results) {
				if(err) return callback(err);

				while(_results.length > 0) {
					callback(null, _results.shift());
				}

				callback(null, null);
			});
		}

		// Execute each using command Cursor
		commandCursor.each({connection: connection}, callback);		
	}

	this.next = function(callback) {
	  // Checkout a connection if we have none
	  if(!connection)
	  	connection = collection.db.serverConfig.checkoutReader(_options.readPreference);
	  
	  // Fall back
		if(!connection.serverCapabilities.hasAggregationCursor) {
			if(!results) {
				// For now we have no cursor command so let's just wrap existing results
				return collection.aggregate(pipe, _options, function(err, _results) {
					if(err) return callback(err);
					results = _results;
	        
	        // Ensure we don't issue undefined
	        var item = results.shift();
	        callback(null, item ? item : null);
				});			
			}

	    // Ensure we don't issue undefined
	    var item = results.shift();
	    // Return the item
	    return callback(null, item ? item : null);
	  }

		// Execute next using command Cursor
		commandCursor.next({connection: connection}, callback);		
	}

	//
	// Close method
	//
	this.close = function(callback) {
	  // Checkout a connection if we have none
	  if(!connection)
	  	connection = collection.db.serverConfig.checkoutReader(_options.readPreference);

	  // Fall back
		if(!connection.serverCapabilities.hasAggregationCursor) {
			return callback(null, null);
		}

		// Execute next using command Cursor
		commandCursor.close({connection: connection}, callback);		
	}

	//
	// Stream method
	//
	this._read = function(n) {
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
inherits(AggregationCursor, Readable);

// Exports the Aggregation Framework
exports.AggregationCursor = AggregationCursor;
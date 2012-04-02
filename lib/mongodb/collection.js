/**
 * Module dependencies.
 * @ignore
 */
var InsertCommand = require('./commands/insert_command').InsertCommand
  , QueryCommand = require('./commands/query_command').QueryCommand
  , DeleteCommand = require('./commands/delete_command').DeleteCommand
  , UpdateCommand = require('./commands/update_command').UpdateCommand
  , DbCommand = require('./commands/db_command').DbCommand
  , ObjectID = require('bson').ObjectID
  , Code = require('bson').Code
  , Cursor = require('./cursor').Cursor
  , utils = require('./utils');

/**
 * Precompiled regexes
 * @ignore
**/
const eErrorMessages = /No matching object found/;

/**
 * toString helper.
 * @ignore
 */
var toString = Object.prototype.toString;

/**
 * Create a new Collection instance
 *
 * Options
 *  - **slaveOk** {Boolean, default:false}, Allow reads from secondaries.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *  - **raw** {Boolean, default:false}, perform all operations using raw bson objects.
 *  - **pkFactory** {Object}, object overriding the basic ObjectID primary key generation.
 *
 * @class Represents a Collection
 * @param {Object} db db instance.
 * @param {String} collectionName collection name.
 * @param {Object} [pkFactory] alternative primary key factory.
 * @param {Object} [options] additional options for the collection.
 * @return {Object} a collection instance.
 */
function Collection (db, collectionName, pkFactory, options) {
  if(!(this instanceof Collection)) return new Collection(db, collectionName, pkFactory, options);
  
  checkCollectionName(collectionName);

  this.db = db;
  this.collectionName = collectionName;
  this.internalHint = null;
  this.opts = options != null && ('object' === typeof options) ? options : {};
  this.slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  this.serializeFunctions = options == null || options.serializeFunctions == null ? db.serializeFunctions : options.serializeFunctions;
  this.raw = options == null || options.raw == null ? db.raw : options.raw;
  this.pkFactory = pkFactory == null
    ? ObjectID
    : pkFactory;
    
  var self = this;
  Object.defineProperty(this, "hint", {
      enumerable: true
    , get: function () {
        return this.internalHint;
      }
    , set: function (v) {
        this.internalHint = normalizeHintField(v);
      }
  });
}

/**
 * Inserts a single document or a an array of documents into MongoDB.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *  - **keepGoing** {Boolean, default:false}, keep inserting documents even if one document has an error, *mongodb 1.9.1 >*.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *
 * @param {Array|Object} docs
 * @param {Object} [options] optional options for insert command
 * @param {Function} [callback] optional callback for the function, must be provided when using `safe` or `strict` mode
 * @return {null}
 * @api public
 */
Collection.prototype.insert = function insert (docs, options, callback) {
  if ('function' === typeof options) callback = options, options = {};
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  var self = this;  
  insertAll(self, Array.isArray(docs) ? docs : [docs], options, callback);
  return this;
};

/**
 * @ignore
 */
var checkCollectionName = function checkCollectionName (collectionName) {
  if ('string' !== typeof collectionName) {
    throw Error("collection name must be a String");
  }

  if (!collectionName || collectionName.indexOf('..') != -1) {
    throw Error("collection names cannot be empty");
  }

  if (collectionName.indexOf('$') != -1 &&
      collectionName.match(/((^\$cmd)|(oplog\.\$main))/) == null) {
    throw Error("collection names must not contain '$'");
  }

  if (collectionName.match(/^\.|\.$/) != null) {
    throw Error("collection names must not start or end with '.'");
  }
};

/**
 * Removes documents specified by `selector` from the db.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @param {Object} [selector] optional select, no selector is equivalent to removing all documents.
 * @param {Object} [options] additional options during remove.
 * @param {Function} [callback] must be provided if you performing a safe remove
 * @return {null}
 * @api public
 */
Collection.prototype.remove = function remove(selector, options, callback) {
  if ('function' === typeof selector) {
    callback = selector;
    selector = options = {};
  } else if ('function' === typeof options) {
    callback = options;
    options = {};
  }
  
  // Ensure options
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;  
  // Ensure we have at least an empty selector
  selector = selector == null ? {} : selector;

  var deleteCommand = new DeleteCommand(
      this.db
    , this.db.databaseName + "." + this.collectionName
    , selector);

  var self = this;
  var errorOptions = options.safe != null ? options.safe : null;
  errorOptions = errorOptions == null && this.opts.safe != null ? this.opts.safe : errorOptions;
  errorOptions = errorOptions == null && this.db.strict != null ? this.db.strict : errorOptions;

  // If we have a write concern set and no callback throw error
  if(errorOptions && errorOptions['safe'] != false && typeof callback !== 'function') throw new Error("safe cannot be used without a callback");
  // Execute the command, do not add a callback as it's async
  if (options && options.safe || this.opts.safe != null || this.db.strict) {
    // Insert options
    var commandOptions = {read:false};
    // If we have safe set set async to false
    if(errorOptions == null) commandOptions['async'] = true;
    // Set safe option
    commandOptions['safe'] = true;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    this.db._executeRemoveCommand(deleteCommand, commandOptions, function (err, error) {
      error = error && error.documents;
      if(!callback) return;      

      if(err) {
        callback(err);
      } else if(error[0].err || error[0].errmsg) {
        callback(self.db.wrap(error[0]));
      } else {
        callback(null, error[0].n);
      }      
    });    
  } else {
    var result = this.db._executeRemoveCommand(deleteCommand);    
    // If no callback just return
    if (!callback) return;
    // If error return error
    if (result instanceof Error) {
      return callback(result);
    }
    // Otherwise just return
    return callback();
  }
};

/**
 * Renames the collection.
 *
 * @param {String} newName the new name of the collection.
 * @param {Function} callback the callback accepting the result
 * @return {null}
 * @api public
 */
Collection.prototype.rename = function rename (newName, callback) {
  var self = this;
  // Ensure the new name is valid
  checkCollectionName(newName);
  // Execute the command, return the new renamed collection if successful
  self.db._executeQueryCommand(DbCommand.createRenameCollectionCommand(self.db, self.collectionName, newName), function(err, result) {
    if(err == null && result.documents[0].ok == 1) {      
      if(callback != null) {
        // Set current object to point to the new name
        self.collectionName = newName;
        // Return the current collection
        callback(null, self);
      }
    } else if(result.documents[0].errmsg != null) {
      if(callback != null) {
        err != null ? callback(err, null) : callback(self.db.wrap(result.documents[0]), null);
      }
    }
  });
};

/**
 * @ignore
 */
var insertAll = function insertAll (self, docs, options, callback) {
  if('function' === typeof options) callback = options, options = {};  
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Insert options (flags for insert)
  var insertFlags = {};
  // If we have a mongodb version >= 1.9.1 support keepGoing attribute
  if(options['keepGoing'] != null) {
    insertFlags['keepGoing'] = options['keepGoing'];
  }
  
  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    insertFlags['serializeFunctions'] = options['serializeFunctions'];
  } else {
    insertFlags['serializeFunctions'] = self.serializeFunctions;
  }
    
  // Pass in options
  var insertCommand = new InsertCommand(
      self.db
    , self.db.databaseName + "." + self.collectionName, true, insertFlags);

  // Add the documents and decorate them with id's if they have none
  for (var index = 0, len = docs.length; index < len; ++index) {
    var doc = docs[index];
    
    // Add id to each document if it's not already defined
    if (!(Buffer.isBuffer(doc)) && doc['_id'] == null && self.db.forceServerObjectId != true) {
      doc['_id'] = self.pkFactory.createPk();
    }

    insertCommand.add(doc);
  }
  
  // Collect errorOptions
  var errorOptions = options.safe != null ? options.safe : null;
  errorOptions = errorOptions == null && self.opts.safe != null ? self.opts.safe : errorOptions;
  errorOptions = errorOptions == null && self.db.strict != null ? self.db.strict : errorOptions;

  // If we have a write concern set and no callback throw error
  if(errorOptions && errorOptions['safe'] != false && typeof callback !== 'function') throw new Error("safe cannot be used without a callback");
  
  // Default command options
  var commandOptions = {};    
  // If safe is defined check for error message
  if(errorOptions && errorOptions != false) {
    // Insert options
    commandOptions['read'] = false;
    // If we have safe set set async to false
    if(errorOptions == null) commandOptions['async'] = true;
    
    // Set safe option
    commandOptions['safe'] = errorOptions;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }
    
    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    self.db._executeInsertCommand(insertCommand, commandOptions, function (err, error) {
      error = error && error.documents;
      if(!callback) return;      

      if (err) {
        callback(err);
      } else if(error[0].err || error[0].errmsg) {
        callback(self.db.wrap(error[0]));
      } else {
        callback(null, docs);
      }      
    });    
  } else {    
    var result = self.db._executeInsertCommand(insertCommand, commandOptions);    
    // If no callback just return
    if(!callback) return;
    // If error return error
    if(result instanceof Error) {
      return callback(result);
    }
    // Otherwise just return
    return callback(null, docs);
  }
};

/**
 * Save a document. Simple full document replacement function. Not recommended for efficiency, use atomic
 * operators and update instead for more efficient operations.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @param {Object} [doc] the document to save
 * @param {Object} [options] additional options during remove.
 * @param {Function} [callback] must be provided if you performing a safe save
 * @return {null}
 * @api public
 */
Collection.prototype.save = function save(doc, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  var errorOptions = options.safe != null ? options.safe : false;    
  errorOptions = errorOptions == null && this.opts.safe != null ? this.opts.safe : errorOptions;
  // Extract the id, if we have one we need to do a update command
  var id = doc['_id'];

  if(id) {
    this.update({ _id: id }, doc, { upsert: true, safe: errorOptions }, callback);
  } else {
    this.insert(doc, { safe: errorOptions }, callback && function (err, docs) {
      if (err) return callback(err, null);

      if (Array.isArray(docs)) {
        callback(err, docs[0]);
      } else {
        callback(err, docs);
      }
    });
  }
};

/**
 * Updates documents.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *  - **upsert** {Boolean, default:false}, perform an upsert operation.
 *  - **multi** {Boolean, default:false}, update all documents matching the selector.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *
 * @param {Object} selector the query to select the document/documents to be updated
 * @param {Object} document the fields/vals to be updated, or in the case of an upsert operation, inserted.
 * @param {Object} [options] additional options during update.
 * @param {Function} [callback] must be provided if you performing a safe update
 * @return {null}
 * @api public
 */
Collection.prototype.update = function update(selector, document, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    options['serializeFunctions'] = options['serializeFunctions'];
  } else {
    options['serializeFunctions'] = this.serializeFunctions;
  }  

  var updateCommand = new UpdateCommand(
      this.db
    , this.db.databaseName + "." + this.collectionName
    , selector
    , document
    , options);

  var self = this;
  // Unpack the error options if any
  var errorOptions = (options && options.safe != null) ? options.safe : null;    
  errorOptions = errorOptions == null && this.opts.safe != null ? this.opts.safe : errorOptions;
  errorOptions = errorOptions == null && this.db.strict != null ? this.db.strict : errorOptions;

  // If we have a write concern set and no callback throw error
  if(errorOptions && errorOptions['safe'] != false && typeof callback !== 'function') throw new Error("safe cannot be used without a callback");
  
  // If we are executing in strict mode or safe both the update and the safe command must happen on the same line
  if(errorOptions && errorOptions != false) {    
    // Insert options
    var commandOptions = {read:false};
    // If we have safe set set async to false
    if(errorOptions == null) commandOptions['async'] = true;
    // Set safe option
    commandOptions['safe'] = true;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    this.db._executeUpdateCommand(updateCommand, commandOptions, function (err, error) {
      error = error && error.documents;
      if(!callback) return;      

      if(err) {
        callback(err);
      } else if(error[0].err || error[0].errmsg) {
        callback(self.db.wrap(error[0]));
      } else {
        // Perform the callback
        callback(null, error[0].n, error[0]);
      }      
    });    
  } else {
    // Execute update
    var result = this.db._executeUpdateCommand(updateCommand);    
    // If no callback just return
    if (!callback) return;
    // If error return error
    if (result instanceof Error) {
      return callback(result);
    }
    // Otherwise just return
    return callback();
  }
};

/**
 * The distinct command returns returns a list of distinct values for the given key across a collection. 
 *
 * @param {String} key key to run distinct against.
 * @param {Object} [query] option query to narrow the returned objects.
 * @param {Function} callback must be provided.
 * @return {null}
 * @api public
 */
Collection.prototype.distinct = function distinct(key, query, callback) {
  if ('function' === typeof query) callback = query, query = {};

  var mapCommandHash = {
      distinct: this.collectionName
    , query: query
    , key: key
  };

  var cmd = DbCommand.createDbSlaveOkCommand(this.db, mapCommandHash);
  
  this.db._executeQueryCommand(cmd, {read:true}, function (err, result) {
    if (err) {
      return callback(err);
    }

    if (result.documents[0].ok != 1) {
      return callback(new Error(result.documents[0].errmsg));
    }

    callback(null, result.documents[0].values);
  });
};

/**
 * Count number of matching documents in the db to a query.
 *
 * @param {Object} [query] query to filter by before performing count.
 * @param {Function} callback must be provided.
 * @return {null}
 * @api public
 */
Collection.prototype.count = function count (query, callback) {
  if ('function' === typeof query) callback = query, query = {};

  var final_query = {
      count: this.collectionName
    , query: query
    , fields: null
  };

  var queryOptions = QueryCommand.OPTS_NO_CURSOR_TIMEOUT;
  if (this.slaveOk || this.db.slaveOk) {
    queryOptions |= QueryCommand.OPTS_SLAVE;
  }

  var queryCommand = new QueryCommand(
      this.db
    , this.db.databaseName + ".$cmd"
    , queryOptions
    , 0
    , -1
    , final_query
    , null
  );

  var self = this;
  this.db._executeQueryCommand(queryCommand, {read:true}, function (err, result) {
    result = result && result.documents;
    if(!callback) return;      

    if (err) {
      callback(err);
    } else if (result[0].ok != 1 || result[0].errmsg) {
      callback(self.db.wrap(result[0]));
    } else {
      callback(null, result[0].n);
    }
  });
};


/**
 * Drop the collection
 *
 * @param {Function} [callback] provide a callback to be notified when command finished executing
 * @return {null}
 * @api public
 */
Collection.prototype.drop = function drop(callback) {
  this.db.dropCollection(this.collectionName, callback);
};

/**
 * Find and update a document.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *  - **remove** {Boolean, default:false}, set to true to remove the object before returning.
 *  - **upsert** {Boolean, default:false}, perform an upsert operation.
 *  - **new** {Boolean, default:false}, set to true if you want to return the modified object rather than the original. Ignored for remove.
 *
 * @param {Object} query query object to locate the object to modify
 * @param {Array}  sort - if multiple docs match, choose the first one in the specified sort order as the object to manipulate
 * @param {Object} doc - the fields/vals to be updated
 * @param {Object} [options] additional options during update.
 * @param {Function} [callback] returns results.
 * @return {null}
 * @api public
 */
Collection.prototype.findAndModify = function findAndModify (query, sort, doc, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  sort = args.length ? args.shift() : [];
  doc = args.length ? args.shift() : null;
  options = args.length ? args.shift() : {};
  var self = this;

  var queryObject = {
      'findandmodify': this.collectionName
    , 'query': query
    , 'sort': utils.formattedOrderClause(sort)
  };

  queryObject.new = options.new ? 1 : 0;
  queryObject.remove = options.remove ? 1 : 0;
  queryObject.upsert = options.upsert ? 1 : 0;

  if (options.fields) {
    queryObject.fields = options.fields;
  }

  if (doc && !options.remove) {
    queryObject.update = doc;
  }

  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    options['serializeFunctions'] = options['serializeFunctions'];
  } else {
    options['serializeFunctions'] = this.serializeFunctions;
  }
  
  // Unpack the error options if any
  var errorOptions = (options && options.safe != null) ? options.safe : null;    
  errorOptions = errorOptions == null && this.opts.safe != null ? this.opts.safe : errorOptions;
  errorOptions = errorOptions == null && this.db.strict != null ? this.db.strict : errorOptions;

  // Commands to send
  var commands = [];
  // Add the find and modify command
  commands.push(DbCommand.createDbSlaveOkCommand(this.db, queryObject, options));
  // If we have safe defined we need to return both call results
  var chainedCommands = errorOptions != null ? true : false;
  // Add error command if we have one
  if(chainedCommands) {
    commands.push(DbCommand.createGetLastErrorCommand(errorOptions, this.db));
  }
  
  // Fire commands and 
  this.db._executeQueryCommand(commands, function(err, result) {
    result = result && result.documents;

    if(err != null) {
      callback(err);
    } else if(result[0].err != null) {
      callback(self.db.wrap(result[0]), null);
    } else if(result[0].errmsg != null && !result[0].errmsg.match(eErrorMessages)) {
      // Workaround due to 1.8.X returning an error on no matching object
      // while 2.0.X does not not, making 2.0.X behaviour standard
      callback(self.db.wrap(result[0]), null);
    } else {
      return callback(null, result[0].value);
    }        
  });
}

/**
 * Find and remove a document
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @param {Object} query query object to locate the object to modify
 * @param {Array}  sort - if multiple docs match, choose the first one in the specified sort order as the object to manipulate
 * @param {Object} [options] additional options during update.
 * @param {Function} [callback] returns results.
 * @return {null}
 * @api public
 */
Collection.prototype.findAndRemove = function(query, sort, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  sort = args.length ? args.shift() : [];
  options = args.length ? args.shift() : {};  
  // Add the remove option
  options['remove'] = true;
  // Execute the callback
  this.findAndModify(query, sort, null, options, callback);  
}

var testForFields = {'limit' : 1, 'sort' : 1, 'fields' : 1, 'skip' : 1, 'hint' : 1, 'explain' : 1, 'snapshot' : 1
  , 'timeout' : 1, 'tailable' : 1, 'batchSize' : 1, 'raw' : 1, 'read' : 1
  , 'returnKey' : 1, 'maxScan' : 1, 'min' : 1, 'max' : 1, 'showDiskLoc' : 1, 'comment' : 1};

/**
 * Creates a cursor for a query that can be used to iterate over results from MongoDB
 *
 * Various argument possibilities
 *  - callback?
 *  - selector, callback?,
 *  - selector, fields, callback?
 *  - selector, options, callback?
 *  - selector, fields, options, callback?
 *  - selector, fields, skip, limit, callback?
 *  - selector, fields, skip, limit, timeout, callback?
 *
 * Options
 *  - **limit** {Number, default:0}, sets the limit of documents returned in the query.
 *  - **sort** {Array | Object}, set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 *  - **fields** {Object}, the fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 *  - **skip** {Number, default:0}, set to skip N documents ahead in your query (useful for pagination).
 *  - **hint** {Object}, tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 *  - **explain** {Boolean, default:false}, explain the query instead of returning the data.
 *  - **snapshot** {Boolean, default:false}, snapshot query.
 *  - **timeout** {Boolean, default:false}, specify if the cursor can timeout.
 *  - **tailable** {Boolean, default:false}, specify if the cursor is tailable.
 *  - **batchSize** {Number, default:0}, set the batchSize for the getMoreCommand when iterating over the query results.
 *  - **returnKey** {Boolean, default:false}, only return the index key.
 *  - **maxScan** {Number}, Limit the number of items to scan.
 *  - **min** {Number}, Set index bounds.
 *  - **max** {Number}, Set index bounds.
 *  - **showDiskLoc** {Boolean, default:false}, Show disk location of results.
 *  - **comment** {String}, You can put a $comment field on a query to make looking in the profiler logs simpler.
 *  - **raw** {Boolean, default:false}, Return all BSON documents as Raw Buffer documents.
 *  - **read** {Boolean, default:false}, Tell the query to read from a secondary server.
 *
 * @param {Object} query query object to locate the object to modify
 * @param {Object} [options] additional options during update.
 * @param {Function} [callback] optional callback for cursor.
 * @return {Cursor} returns a cursor to the query
 * @api public
 */
Collection.prototype.find = function find () {
  var options
    , args = Array.prototype.slice.call(arguments, 0)
    , has_callback = typeof args[args.length - 1] === 'function'
    , has_weird_callback = typeof args[0] === 'function'
    , callback = has_callback ? args.pop() : (has_weird_callback ? args.shift() : null)
    , len = args.length
    , selector = len >= 1 ? args[0] : {}
    , fields = len >= 2 ? args[1] : undefined;

  if(len === 1 && has_weird_callback) {
    // backwards compat for callback?, options case
    selector = {};
    options = args[0];
  }
    
  if(len === 2 && !Array.isArray(fields)) {
    var fieldKeys = Object.getOwnPropertyNames(fields);
    var is_option = false;
    
    for(var i = 0; i < fieldKeys.length; i++) {
      if(testForFields[fieldKeys[i]] != null) {
        is_option = true;
        break;
      }
    }
    
    if(is_option) {
      options = fields;
      fields = undefined;
    } else {
      options = {};
    }
  } else if(len === 2 && Array.isArray(fields) && !Array.isArray(fields[0])) {
    var newFields = {};
    // Rewrite the array
    for(var i = 0; i < fields.length; i++) {
      newFields[fields[i]] = 1;
    }
    // Set the fields
    fields = newFields;
  }

  if(3 === len) {
    options = args[2];
  }

  // Ensure selector is not null
  selector = selector == null ? {} : selector;
  // Validate correctness off the selector
  var object = selector;
  if(Buffer.isBuffer(object)) {
    var object_size = object[0] | object[1] << 8 | object[2] << 16 | object[3] << 24;    
    if(object_size != object.length)  {
      var error = new Error("query selector raw message size does not match message header size [" + object.length + "] != [" + object_size + "]");
      error.name = 'MongoError';
      throw error;
    }
  }
  
  // Validate correctness of the field selector
  var object = fields;
  if(Buffer.isBuffer(object)) {
    var object_size = object[0] | object[1] << 8 | object[2] << 16 | object[3] << 24;    
    if(object_size != object.length)  {
      var error = new Error("query fields raw message size does not match message header size [" + object.length + "] != [" + object_size + "]");
      error.name = 'MongoError';
      throw error;
    }
  }    
  
  // Check special case where we are using an objectId
  if(selector instanceof ObjectID) {
    selector = {_id:selector};
  }

  // If it's a serialized fields field we need to just let it through
  // user be warned it better be good
  if(options && options.fields && !(Buffer.isBuffer(options.fields))) {
    fields = {};

    if(Array.isArray(options.fields)) {
      if(!options.fields.length) {
        fields['_id'] = 1;
      } else {
        for (var i = 0, l = options.fields.length; i < l; i++) {
          fields[options.fields[i]] = 1;
        }
      }
    } else {
      fields = options.fields;
    }
  }

  if (!options) options = {};
  options.skip = len > 3 ? args[2] : options.skip ? options.skip : 0;
  options.limit = len > 3 ? args[3] : options.limit ? options.limit : 0;
  options.raw = options.raw != null && typeof options.raw === 'boolean' ? options.raw : this.raw;
  options.hint = options.hint != null ? normalizeHintField(options.hint) : this.internalHint;
  options.timeout = len == 5 ? args[4] : typeof options.timeout === 'undefined' ? undefined : options.timeout;
  // If we have overridden slaveOk otherwise use the default db setting
  options.slaveOk = options.slaveOk != null ? options.slaveOk : this.db.slaveOk;
  var o = options;

  // callback for backward compatibility
  if(callback) {
    // TODO refactor Cursor args
    callback(null, new Cursor(this.db, this, selector, fields, o.skip, o.limit
		, o.sort, o.hint, o.explain, o.snapshot, o.timeout, o.tailable, o.batchSize
		, o.slaveOk, o.raw, o.read, o.returnKey, o.maxScan, o.min, o.max, o.showDiskLoc, o.comment));
  } else {
    return new Cursor(this.db, this, selector, fields, o.skip, o.limit
		, o.sort, o.hint, o.explain, o.snapshot, o.timeout, o.tailable, o.batchSize
		, o.slaveOk, o.raw, o.read, o.returnKey, o.maxScan, o.min, o.max, o.showDiskLoc, o.comment);
  }
};

/**
 * Normalizes a `hint` argument.
 *
 * @param {String|Object|Array} hint
 * @return {Object}
 * @api private
 */
var normalizeHintField = function normalizeHintField(hint) {
  var finalHint = null;

  if (null != hint) {
    switch (hint.constructor) {
      case String:
        finalHint = {};
        finalHint[hint] = 1;
        break;
      case Object:
        finalHint = {};
        for (var name in hint) {
          finalHint[name] = hint[name];
        }
        break;
      case Array:
        finalHint = {};
        hint.forEach(function(param) {
          finalHint[param] = 1;
        });
        break;
    }
  }

  return finalHint;
};

/**
 * Finds a single document based on the query
 *
 * Various argument possibilities
 *  - callback?
 *  - selector, callback?,
 *  - selector, fields, callback?
 *  - selector, options, callback?
 *  - selector, fields, options, callback?
 *  - selector, fields, skip, limit, callback?
 *  - selector, fields, skip, limit, timeout, callback?
 *
 * Options
 *  - **limit** {Number, default:0}, sets the limit of documents returned in the query.
 *  - **sort** {Array | Object}, set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 *  - **fields** {Object}, the fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 *  - **skip** {Number, default:0}, set to skip N documents ahead in your query (useful for pagination).
 *  - **hint** {Object}, tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 *  - **explain** {Boolean, default:false}, explain the query instead of returning the data.
 *  - **snapshot** {Boolean, default:false}, snapshot query.
 *  - **timeout** {Boolean, default:false}, specify if the cursor can timeout.
 *  - **tailable** {Boolean, default:false}, specify if the cursor is tailable.
 *  - **batchSize** {Number, default:0}, set the batchSize for the getMoreCommand when iterating over the query results.
 *  - **returnKey** {Boolean, default:false}, only return the index key.
 *  - **maxScan** {Number}, Limit the number of items to scan.
 *  - **min** {Number}, Set index bounds.
 *  - **max** {Number}, Set index bounds.
 *  - **showDiskLoc** {Boolean, default:false}, Show disk location of results.
 *  - **comment** {String}, You can put a $comment field on a query to make looking in the profiler logs simpler.
 *  - **raw** {Boolean, default:false}, Return all BSON documents as Raw Buffer documents.
 *  - **read** {Boolean, default:false}, Tell the query to read from a secondary server.
 *
 * @param {Object} query query object to locate the object to modify
 * @param {Object} [options] additional options during update.
 * @param {Function} [callback] optional callback for cursor.
 * @return {Cursor} returns a cursor to the query
 * @api public
 */
Collection.prototype.findOne = function findOne () {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  var callback = args.pop();
  var cursor = this.find.apply(this, args).limit(-1).batchSize(1);
  // Return the item
  cursor.toArray(function(err, items) {
    if(err != null) return callback(err instanceof Error ? err : self.db.wrap(new Error(err)), null);
    if(items.length == 1) return callback(null, items[0]);    
    callback(null, null);    
  });
};

/**
 * Creates an index on the collection.
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a 
 *  - **unique** {Boolean, default:false}, creates an unique index.
 *  - **sparse** {Boolean, default:false}, creates a sparse index.
 *  - **background** {Boolean, default:false}, creates the index in the background, yielding whenever possible.
 *  - **dropDups** {Boolean, default:false}, a unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 *  - **min** {Number}, for geospatial indexes set the lower bound for the co-ordinates.
 *  - **max** {Number}, for geospatial indexes set the high bound for the co-ordinates.
 *
 * @param {Object} fieldOrSpec fieldOrSpec that defines the index.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback for results.
 * @return {null}
 * @api public
 */
Collection.prototype.createIndex = function createIndex (fieldOrSpec, options, callback) {
  // Clean up call
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  options = typeof callback === 'function' ? options : callback;
  options = options == null ? {} : options;

  // Collect errorOptions
  var errorOptions = options.safe != null ? options.safe : null;
  errorOptions = errorOptions == null && this.opts.safe != null ? this.opts.safe : errorOptions;
  errorOptions = errorOptions == null && this.db.strict != null ? this.db.strict : errorOptions;
  
  // If we have a write concern set and no callback throw error
  if(errorOptions != null && errorOptions != false && (typeof callback !== 'function' && typeof options !== 'function')) throw new Error("safe cannot be used without a callback");

  // Execute create index
  this.db.createIndex(this.collectionName, fieldOrSpec, options, callback);
};

/**
 * Ensures that an index exists, if it does not it creates it
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a 
 *  - **unique** {Boolean, default:false}, creates an unique index.
 *  - **sparse** {Boolean, default:false}, creates a sparse index.
 *  - **background** {Boolean, default:false}, creates the index in the background, yielding whenever possible.
 *  - **dropDups** {Boolean, default:false}, a unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 *  - **min** {Number}, for geospatial indexes set the lower bound for the co-ordinates.
 *  - **max** {Number}, for geospatial indexes set the high bound for the co-ordinates.
 *  - **v** {Number}, specify the format version of the indexes.
 *
 * @param {Object} fieldOrSpec fieldOrSpec that defines the index.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback for results.
 * @return {null}
 * @api public
 */
Collection.prototype.ensureIndex = function ensureIndex (fieldOrSpec, options, callback) {
  // Clean up call
  if (typeof callback === 'undefined' && typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (options == null) {
    options = {};
  }
  
  // Collect errorOptions
  var errorOptions = options.safe != null ? options.safe : null;
  errorOptions = errorOptions == null && this.opts.safe != null ? this.opts.safe : errorOptions;
  errorOptions = errorOptions == null && this.db.strict != null ? this.db.strict : errorOptions;
  
  // If we have a write concern set and no callback throw error
  if(errorOptions != null && errorOptions != false && (typeof callback !== 'function' && typeof options !== 'function')) throw new Error("safe cannot be used without a callback");
  
  // Execute create index
  this.db.ensureIndex(this.collectionName, fieldOrSpec, options, callback);
};

/**
 * Retrieves this collections index info.
 *
 * Options
 *  - **full** {Boolean, default:false}, returns the full raw index information.
 *
 * @param {Object} [options] additional options during update.
 * @param {Function} callback returns the index information.
 * @return {null}
 * @api public
 */
Collection.prototype.indexInformation = function indexInformation (options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  // Call the index information
  this.db.indexInformation(this.collectionName, options, callback);
};

/**
 * Drops an index from this collection.
 *
 * @param {String} name
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Collection.prototype.dropIndex = function dropIndex (name, callback) {
  this.db.dropIndex(this.collectionName, name, callback);
};

/**
 * Drops all indexes from this collection.
 *
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Collection.prototype.dropAllIndexes = function dropIndexes (callback) {
  this.db.dropIndex(this.collectionName, '*', function (err, result) {
    if(err != null) {
      callback(err, false);
    } else if(result.documents[0].errmsg == null) {
      callback(null, true);
    } else {
      callback(new Error(result.documents[0].errmsg), false);
    }
  });
};

/**
 * Drops all indexes from this collection.
 *
 * @deprecated
 * @param {Function} callback returns the results.
 * @return {null}
 * @api private
 */
Collection.prototype.dropIndexes = Collection.prototype.dropAllIndexes;

/**
 * Reindex all indexes on the collection
 * Warning: reIndex is a blocking operation (indexes are rebuilt in the foreground) and will be slow for large collections.
 *
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public 
**/
Collection.prototype.reIndex = function(callback) {
  this.db.reIndex(this.collectionName, callback);
}

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * Options
 *  - **out** {Object, default:*{inline:1}*}, sets the output target for the map reduce job. *{inline:1} | {replace:'collectionName'} | {merge:'collectionName'} | {reduce:'collectionName'}*
 *  - **query** {Object}, query filter object.
 *  - **sort** {Object}, sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces.
 *  - **limit** {Number}, number of objects to return from collection.
 *  - **keeptemp** {Boolean, default:false}, keep temporary data.
 *  - **finalize** {Function | String}, finalize function.
 *  - **scope** {Object}, can pass in variables that can be access from map/reduce/finalize.
 *  - **jsMode** {Boolean, default:false}, it is possible to make the execution stay in JS. Provided in MongoDB > 2.0.X.
 *  - **verbose** {Boolean, default:false}, provide statistics on job execution time.
 *
 * @param {Function|String} map the mapping function.
 * @param {Function|String} reduce the reduce function.
 * @param {Objects} [options] options for the map reduce job.
 * @param {Function} callback returns the result of the map reduce job, (error, results, [stats])
 * @return {null}
 * @api public
 */
Collection.prototype.mapReduce = function mapReduce (map, reduce, options, callback) {
  if ('function' === typeof options) callback = options, options = {};
  // Out must allways be defined (make sure we don't break weirdly on pre 1.8+ servers)
  if(null == options.out) {
    throw new Error("the out option parameter must be defined, see mongodb docs for possible values");
  }

  if ('function' === typeof map) {
    map = map.toString();
  }

  if ('function' === typeof reduce) {
    reduce = reduce.toString();
  }

  if ('function' === typeof options.finalize) {
    options.finalize = options.finalize.toString();
  }

  var mapCommandHash = {
      mapreduce: this.collectionName
    , map: map
    , reduce: reduce
  };

  // Add any other options passed in
  for (var name in options) {
    mapCommandHash[name] = options[name];
  }
  
  var self = this;
  var cmd = DbCommand.createDbSlaveOkCommand(this.db, mapCommandHash);

  this.db._executeQueryCommand(cmd, {read:true}, function (err, result) {
    if (err) {
      return callback(err);
    }

    // 
    if (1 != result.documents[0].ok || result.documents[0].err || result.documents[0].errmsg) {
      return callback(self.db.wrap(result.documents[0]));
    }

    // Create statistics value
    var stats = {};
    if(result.documents[0].timeMillis) stats['processtime'] = result.documents[0].timeMillis;
    if(result.documents[0].counts) stats['counts'] = result.documents[0].counts;
    if(result.documents[0].timing) stats['timing'] = result.documents[0].timing;

    // invoked with inline?
    if (result.documents[0].results) {
      return callback(null, result.documents[0].results, stats);
    }

    // Create a collection object that wraps the result collection
    self.db.collection(result.documents[0].result, function (err, collection) {
      // If we wish for no verbosity
      if(options['verbose'] == null || !options['verbose']) {
        return callback(err, collection);
      }

      // Create statistics value
      var stats = {};
      if(result.documents[0].timeMillis) stats['processtime'] = result.documents[0].timeMillis;
      if(result.documents[0].counts) stats['counts'] = result.documents[0].counts;
      if(result.documents[0].timing) stats['timing'] = result.documents[0].timing;
      // Return stats as third set of values
      callback(err, collection, stats);
    });
  });
};

/**
 * Group function helper
 * @ignore
 */
var groupFunction = function () {
  var c = db[ns].find(condition);
  var map = new Map();
  var reduce_function = reduce;

  while (c.hasNext()) {
    var obj = c.next();
    var key = {};

    for (var i = 0, len = keys.length; i < len; ++i) {
      var k = keys[i];
      key[k] = obj[k];
    }

    var aggObj = map.get(key);

    if (aggObj == null) {
      var newObj = Object.extend({}, key);
      aggObj = Object.extend(newObj, initial);
      map.put(key, aggObj);
    }

    reduce_function(obj, aggObj);
  }

  return { "result": map.values() };
}.toString();

/**
 * Run a group command across a collection
 *
 * @param {Object|Array|Function|Code} keys an object, array or function expressing the keys to group by.
 * @param {Object} condition an optional condition that must be true for a row to be considered.
 * @param {Object} initial initial value of the aggregation counter object. 
 * @param {Function|Code} reduce the reduce function aggregates (reduces) the objects iterated
 * @param {Function|Code} finalize an optional function to be run on each item in the result set just before the item is returned.
 * @param {Boolean} command specify if you wish to run using the internal group command or using eval, default is true.
 * @param {Function} callback returns the results.
 * @return {null}
 * @api public
 */
Collection.prototype.group = function group(keys, condition, initial, reduce, finalize, command, callback) {
  var args = Array.prototype.slice.call(arguments, 3);
  callback = args.pop();
  // Fetch all commands
  reduce = args.length ? args.shift() : null;
  finalize = args.length ? args.shift() : null;
  command = args.length ? args.shift() : null;

  // Make sure we are backward compatible
  if(!(typeof finalize == 'function')) {
    command = finalize;
    finalize = null;
  }

  if (!Array.isArray(keys) && keys instanceof Object && typeof(keys) !== 'function') {
    keys = Object.keys(keys);
  }
  
  if(typeof reduce === 'function') {
    reduce = reduce.toString();
  }
  
  if(typeof finalize === 'function') {
    finalize = finalize.toString();
  }
  
  // Set up the command as default
  command = command == null ? true : command;
  
  // Execute using the command
  if(command) {
    var reduceFunction = reduce instanceof Code
        ? reduce
        : new Code(reduce);

    var selector = {
      group: {
          'ns': this.collectionName
        , '$reduce': reduceFunction
        , 'cond': condition
        , 'initial': initial
        , 'out': "inline"
      }      
    };
    
    // if finalize is defined
    if(finalize != null) selector.group['finalize'] = finalize;
    // Set up group selector
    if ('function' === typeof keys) {
      selector.group.$keyf = keys instanceof Code
        ? keys
        : new Code(keys);
    } else {
      var hash = {};
      keys.forEach(function (key) {
        hash[key] = 1;
      });
      selector.group.key = hash;
    }

    var cmd = DbCommand.createDbSlaveOkCommand(this.db, selector);
    
    this.db._executeQueryCommand(cmd, {read:true}, function (err, result) {
      if(err != null) return callback(err);
      
      var document = result.documents[0];
      if (null == document.retval) {
        return callback(new Error("group command failed: " + document.errmsg));
      }

      callback(null, document.retval);
    });

  } else {
    // Create execution scope
    var scope = reduce != null && reduce instanceof Code
      ? reduce.scope
      : {};

    scope.ns = this.collectionName;
    scope.keys = keys;
    scope.condition = condition;
    scope.initial = initial;
    
    // Pass in the function text to execute within mongodb.
    var groupfn = groupFunction.replace(/ reduce;/, reduce.toString() + ';');

    this.db.eval(new Code(groupfn, scope), function (err, results) {      
      if (err) return callback(err, null);
      callback(null, results.result || results);
    });
  }
};

/**
 * Returns the options of the collection.
 *
 * @param {Function} callback returns option results.
 * @return {null}
 * @api public
 */
Collection.prototype.options = function options(callback) {
  this.db.collectionsInfo(this.collectionName, function (err, cursor) {
    if (err) return callback(err);
    cursor.nextObject(function (err, document) {
      callback(err, document && document.options || null);
    });
  });
};

/**
 * Returns if the collection is a capped collection
 *
 * @param {Function} callback returns if collection is capped.
 * @return {null}
 * @api public
 */
Collection.prototype.isCapped = function isCapped(callback) {
  this.options(function(err, document) {
    if(err != null) {
      callback(err);
    } else {
      callback(null, document.capped);
    }
  });
};

/**
 * Checks if one or more indexes exist on the collection
 *
 * @param {String|Array} indexNames check if one or more indexes exist on the collection.
 * @param {Function} callback returns if the indexes exist.
 * @return {null}
 * @api public
 */
Collection.prototype.indexExists = function indexExists(indexes, callback) {
 this.indexInformation(function(err, indexInformation) {
   // If we have an error return
   if(err != null) return callback(err, null);
   // Let's check for the index names
   if(Array.isArray(indexes)) {
     for(var i = 0; i < indexes.length; i++) {
       if(indexInformation[indexes[i]] == null) {
         return callback(null, false);
       }
     }
     
     // All keys found return true
     return callback(null, true);
   } else {
     return callback(null, indexInformation[indexes] != null);
   }
 }); 
}

/**
 * Execute the geoNear command to search for items in the collection
 *
 * Options
 *  - **num** {Number}, max number of results to return.
 *  - **maxDistance** {Number}, include results up to maxDistance from the point.
 *  - **distanceMultiplier** {Number}, include a value to multiply the distances with allowing for range conversions.
 *  - **query** {Object}, filter the results by a query.
 *  - **spherical** {Boolean, default:false}, perform query using a spherical model.
 *  - **uniqueDocs** {Boolean, default:false}, the closest location in a document to the center of the search region will always be returned MongoDB > 2.X.
 *  - **includeLocs** {Boolean, default:false}, include the location data fields in the top level of the results MongoDB > 2.X.
 *
 * @param {Number} x point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {Number} y point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {Objects} [options] options for the map reduce job.
 * @param {Function} callback returns matching documents.
 * @return {null}
 * @api public
 */
Collection.prototype.geoNear = function geoNear(x, y, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() : {};

  // Build command object
  var commandObject = {
    geoNear:this.collectionName,
    near: [x, y]
  }
  
  // Decorate object if any with known properties
  if(options['num'] != null) commandObject['num'] = options['num'];
  if(options['maxDistance'] != null) commandObject['maxDistance'] = options['maxDistance'];
  if(options['distanceMultiplier'] != null) commandObject['distanceMultiplier'] = options['distanceMultiplier'];
  if(options['query'] != null) commandObject['query'] = options['query'];
  if(options['spherical'] != null) commandObject['spherical'] = options['spherical'];
  if(options['uniqueDocs'] != null) commandObject['uniqueDocs'] = options['uniqueDocs'];
  if(options['includeLocs'] != null) commandObject['includeLocs'] = options['includeLocs'];

  // Execute the command
  this.db.command(commandObject, callback);
}

/**
 * Execute a geo search using a geo haystack index on a collection.
 *
 * Options
 *  - **maxDistance** {Number}, include results up to maxDistance from the point.
 *  - **search** {Object}, filter the results by a query.
 *  - **limit** {Number}, max number of results to return.
 *
 * @param {Number} x point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {Number} y point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {Objects} [options] options for the map reduce job.
 * @param {Function} callback returns matching documents.
 * @return {null}
 * @api public
 */
Collection.prototype.geoHaystackSearch = function geoHaystackSearch(x, y, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() : {};

  // Build command object
  var commandObject = {
    geoSearch:this.collectionName,
    near: [x, y]
  }
  
  // Decorate object if any with known properties
  if(options['maxDistance'] != null) commandObject['maxDistance'] = options['maxDistance'];
  if(options['query'] != null) commandObject['search'] = options['query'];
  if(options['search'] != null) commandObject['search'] = options['search'];
  if(options['limit'] != null) commandObject['limit'] = options['limit'];

  // Execute the command
  this.db.command(commandObject, callback);  
}

/**
 * Retrieve all the indexes on the collection.
 *
 * @param {Function} callback returns index information.
 * @return {null}
 * @api public
 */
Collection.prototype.indexes = function indexes(callback) {
  // Return all the index information
  this.db.indexInformation(this.collectionName, {full:true}, callback);
}

/**
 * Execute an aggregation framework pipeline against the collection, needs MongoDB >= 2.1
 *
 * @param {Array|Objects} pipline a pipleline containing all the object for the execution.
 * @param {Function} callback returns matching documents.
 * @return {null}
 * @api public
 */
Collection.prototype.aggregate = function(pipeline, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  var self = this;
  
  // Check if we have more than one argument then just make the pipeline 
  // the remaining arguments
  if(args.length > 1) {
    pipeline = args;
  }
  
  // Build the command
  var command = { aggregate : this.collectionName, pipeline : pipeline};
  // Execute the command
  this.db.command(command, function(err, result) {
    if(err) {
      callback(err);
    } else if(result['err'] || result['errmsg']) {
      callback(self.db.wrap(result));
    } else {
      callback(null, result.result);
    }      
  });
}

/**
 * Get all the collection statistics.
 *
 * Options
 *  - **scale** {Number}, divide the returned sizes by scale value.
 *
 * @param {Objects} [options] options for the map reduce job.
 * @param {Function} callback returns statistical information for the collection.
 * @return {null}
 * @api public
 */
Collection.prototype.stats = function stats(options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() : {};

  // Build command object
  var commandObject = {
    collStats:this.collectionName,
  }

  // Check if we have the scale value
  if(options['scale'] != null) commandObject['scale'] = options['scale'];

  // Execute the command
  this.db.command(commandObject, callback);  
}

/**
 * Expose.
 */
exports.Collection = Collection;














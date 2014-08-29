var checkCollectionName = require('./utils').checkCollectionName
  , ObjectID = require('mongodb-core').BSON.ObjectID
  , Long = require('mongodb-core').BSON.Long
  , Code = require('mongodb-core').BSON.Code
  , f = require('util').format
  , AggregationCursor = require('./aggregation_cursor')
  , MongoError = require('mongodb-core').MongoError
  , shallowClone = require('./utils').shallowClone
  , isObject = require('./utils').isObject
  , toError = require('./utils').toError
  , normalizeHintField = require('./utils').normalizeHintField
  , handleCallback = require('./utils').handleCallback
  , decorateCommand = require('./utils').decorateCommand
  , formattedOrderClause = require('./utils').formattedOrderClause
  , ReadPreference = require('./read_preference')
  , CoreReadPreference = require('mongodb-core').ReadPreference
  , Cursor = require('./cursor')
  , unordered = require('./bulk/unordered')
  , ordered = require('./bulk/ordered');

var Collection = function(db, topology, dbName, name, pkFactory, options) {  
  checkCollectionName(name);
  var self = this;
  // Unpack variables
  var internalHint = null;
  var opts = options != null && ('object' === typeof options) ? options : {};
  var slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  var serializeFunctions = options == null || options.serializeFunctions == null ? db.serializeFunctions : options.serializeFunctions;
  var raw = options == null || options.raw == null ? db.raw : options.raw;
  var readPreference = null;
  var collectionHint = null;
  var namespace = f("%s.%s", dbName, name);

  // Assign the right collection level readPreference
  if(options && options.readPreference) {
    readPreference = options.readPreference;
  } else if(db.options.readPreference) {
    readPreference = db.options.readPreference;
  }

  // Set custom primary key factory if provided
  pkFactory = pkFactory == null
    ? ObjectID
    : pkFactory;

  Object.defineProperty(this, 'collectionName', {
    enumerable: true, get: function() { return name; }
  });

  Object.defineProperty(this, 'namespace', {
    enumerable: true, get: function() { return namespace; }
  });

  Object.defineProperty(this, 'writeConcern', {
    enumerable:true,
    get: function() { 
      var ops = {};
      if(options.w != null) ops.w = options.w;
      if(options.j != null) ops.j = options.j;
      if(options.fsync != null) ops.fsync = options.fsync;
      if(options.wtimeout != null) ops.wtimeout = options.wtimeout;
      return ops;
    }
  });

  /**
   * @ignore
   */
  Object.defineProperty(this, "hint", {
      enumerable: true
    , get: function () { return collectionHint; }
    , set: function (v) { collectionHint = normalizeHintField(v); }
  });

  // Get write concern
  var writeConcern = function(target, db, col, options) {
    if(options.w != null || options.j != null || options.fsync != null) {
      var opts = {};
      if(options.w) opts.w = options.w;
      if(options.wtimeout) opts.wtimeout = options.wtimeout;
      if(options.j) opts.j = options.j;
      if(options.fsync) opts.fsync = options.fsync;
      target.writeConcern = opts;
    } else if(col.writeConcern.w != null || col.writeConcern.j != null || col.writeConcern.fsync != null) {      
      target.writeConcern = col.writeConcern;
    } else if(db.writeConcern.w != null || db.writeConcern.j != null || db.writeConcern.fsync != null) {
      target.writeConcern = db.writeConcern;
    }

    return target
  }

  // Figure out the read preference
  var getReadPreference = function(options, db, coll) {
    var r = null
    if(options.readPreference) {
      r = options.readPreference
    } else if(readPreference) {
      r = readPreference
    } else if(db.readPreference) {
      r = db.readPreference;
    }

    if(r instanceof ReadPreference) {      
      options.readPreference = new CoreReadPreference(r.mode, r.tags);
    } else if(typeof r == 'string') {
      options.readPreference = new CoreReadPreference(r);
    }

    return options;
  }

  var testForFields = {
      limit: 1, sort: 1, fields:1, skip: 1, hint: 1, explain: 1, snapshot: 1, timeout: 1, tailable: 1, tailableRetryInterval: 1
    , numberOfRetries: 1, awaitdata: 1, exhaust: 1, batchSize: 1, returnKey: 1, maxScan: 1, min: 1, max: 1, showDiskLoc: 1
    , comment: 1, raw: 1, readPreference: 1, partial: 1, read: 1, dbName: 1, oplogReplay: 1, connection: 1
  }

  //
  // Find method
  //
  this.find = function() {
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
    if(selector instanceof ObjectID || (selector != null && selector._bsontype == 'ObjectID')) {
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

    var newOptions = {};
    // Make a shallow copy of options
    for (var key in options) {
      newOptions[key] = options[key];
    }

    // Unpack options
    newOptions.skip = len > 3 ? args[2] : options.skip ? options.skip : 0;
    newOptions.limit = len > 3 ? args[3] : options.limit ? options.limit : 0;
    newOptions.raw = options.raw != null && typeof options.raw === 'boolean' ? options.raw : this.raw;
    newOptions.hint = options.hint != null ? normalizeHintField(options.hint) : collectionHint;
    newOptions.timeout = len == 5 ? args[4] : typeof options.timeout === 'undefined' ? undefined : options.timeout;
    // // If we have overridden slaveOk otherwise use the default db setting
    newOptions.slaveOk = options.slaveOk != null ? options.slaveOk : db.slaveOk;

    // Add read preference if needed
    newOptions = getReadPreference(newOptions, db, self);
    // Set slave ok to true if read preference different from primary
    if(newOptions.readPreference != null
      && (newOptions.readPreference != 'primary' || newOptions.readPreference.mode != 'primary')) {
      newOptions.slaveOk = true;
    }

    // Build the find command
    var findCommand = {
        find: namespace
      , limit: newOptions.limit
      , skip: newOptions.skip
      , query: selector
    }

    // Merge in options to command
    for(var name in newOptions) {
      if(newOptions[name] != null) findCommand[name] = newOptions[name];
    }

    // Format the fields
    var formatFields = function(fields) {
      var object = {};
      if(Array.isArray(fields)) {
        for(var i = 0; i < fields.length; i++) {
          if(Array.isArray(fields[i])) {
            object[fields[i][0]] = fields[i][1];
          } else {
            object[fields[i][0]] = 1;
          }
        }
      } else {
        object = fields;
      }

      return object;
    }

    // Special treatment for the fields selector
    if(fields) findCommand.fields = formatFields(fields);
    // Ensure we use the right await data option
    if(newOptions.awaitdata) newOptions.awaitData = newOptions.awaitdata;
    // Translate to new command option noCursorTimeout
    if(typeof newOptions.timeout == 'boolean') newOptions.noCursorTimeout = newOptions.timeout;

    // Add db object to the new options
    newOptions.db = db;

    // Set raw if available at collection level
    if(newOptions.raw == null && raw) newOptions.raw = raw;

    // Sort options
    if(findCommand.sort) 
      findCommand.sort = formattedOrderClause(findCommand.sort);

    // Create the cursor
    if(typeof callback == 'function') return handleCallback(callback, null, topology.cursor(namespace, findCommand, newOptions));
    return topology.cursor(namespace, findCommand, newOptions);
  }

  this.insertOne = function(doc, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    if(Array.isArray(doc)) return callback(new MongoError('doc parameter must be an object'));
    this.insert([doc], options, function(err, r) {
      if(err) return callback(err);
      r.insertedCount = r.result.n;
      r.insertedId = doc._id;
      callback(null, r);
    });
  }

  this.insertMany = function(docs, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    if(!Array.isArray(docs)) return callback(new MongoError('docs parameter must be an array of documents'));    
    this.insert(docs, options, function(err, r) {
      if(err) return callback(err);
      r.insertedCount = r.result.n;
      var ids = [];
      for(var i = 0; i < docs.length; i++) {
        if(docs[i]._id) ids.push(docs[i]._id);
      }
      r.insertedIds = ids;
      callback(null, r);
    });
  }

  this.bulkWrite = function(doc, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    if(typeof callback != 'function') throw new MongoError("bulkWrite must have a callback function specified");
    var bulk = doc.ordered == true ? this.initializeOrderedBulkOp() : this.initializeUnorderedBulkOp();
    // for each op go through and add to the bulk
    for(var i = 0; i < doc.operations.length; i++) {
      bulk.raw(doc.operations[i]);
    }
    // Execute the bulk
    bulk.execute(function(err, r) {
      r.insertedCount = r.nInserted;
      r.matchedCount = r.nMatched;
      r.modifiedCount = r.nModified;
      r.removedCount = r.nRemoved;
      r.upsertedCount = r.getUpsertedIds().length;
      r.upsertedIds = r.getUpsertedIds();
      callback(null, r);
    });
  }

  // Insert operations
  this.insert = function(docs, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};
    // Ensure we are operating on an array op docs
    docs = Array.isArray(docs) ? docs : [docs];

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), db, this, options);
    if(typeof finalOptions.checkKeys != 'boolean') finalOptions.checkKeys = true;

    // If keep going set unordered
    if(options.keepGoing == true) finalOptions.ordered = false;
    finalOptions['serializeFunctions'] = options['serializeFunctions'] || serializeFunctions;

    // Add _id if not specified
    for(var i = 0; i < docs.length; i++) {
      if(docs[i]._id == null) docs[i]._id = pkFactory.createPk();
    }

    // File inserts
    topology.insert(namespace, docs, finalOptions, function(err, result) {
      if(callback == null) return;
      if(err) return handleCallback(callback, err);
      if(result == null) return handleCallback(callback, null, null);
      if(result.result.code) return handleCallback(callback, toError(result.result));
      if(result.result.writeErrors) return handleCallback(callback, toError(result.result.writeErrors[0]));
      // Add docs to the list
      result.ops = docs;
      // Return the results
      handleCallback(callback, null, result);   
    });
  }

  this.updateOne = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = shallowClone(options)
    if(typeof op.upsert == 'boolean') options.upsert = op.upsert;
    options.multi = false;
    // Execute update
    this.update(op.filter, op.update, options, function(err, r) {
      if(err) return callback(err);
      r.matchedCount = r.result.n;
      r.modifiedCount = r.result.n;
      r.upsertedId = Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? r.result.upserted[0] : null;
      callback(null, r);      
    });
  }

  this.replaceOne = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = shallowClone(options)
    if(typeof op.upsert == 'boolean') options.upsert = op.upsert;
    options.multi = false;
    // Execute update
    this.update(op.filter, op.replacement, options, function(err, r) {
      if(err) return callback(err);
      r.matchedCount = r.result.n;
      r.modifiedCount = r.result.n;
      r.upsertedId = Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? r.result.upserted[0] : null;
      callback(null, r);      
    });
  }

  this.updateMany = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = shallowClone(options)
    if(typeof op.upsert == 'boolean') options.upsert = op.upsert;
    options.multi = true;
    // Execute update
    this.update(op.filter, op.update, options, function(err, r) {
      if(err) return callback(err);
      r.matchedCount = r.result.n;
      r.modifiedCount = r.result.n;
      r.upsertedId = Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? r.result.upserted[0]._id : null;
      callback(null, r);      
    });
  }

  // Update operations
  this.update = function(selector, document, options, callback) {
    if('function' === typeof options) callback = options, options = null;
    if(options == null) options = {};
    if(!('function' === typeof callback)) callback = null;

    // If we are not providing a selector or document throw
    if(selector == null || typeof selector != 'object') return callback(toError("selector must be a valid JavaScript object"));
    if(document == null || typeof document != 'object') return callback(toError("document must be a valid JavaScript object"));

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), db, this, options);

    // Do we return the actual result document
    // Either use override on the function, or go back to default on either the collection
    // level or db
    options['serializeFunctions'] = options['serializeFunctions'] || serializeFunctions;

    // Execute the operation
    var op = {q: selector, u: document};
    if(options.upsert) op.upsert = true;
    if(options.multi) op.multi = true;

    // Update options
    topology.update(namespace, [op], finalOptions, function(err, result) {
      if(callback == null) return;
      if(err) return handleCallback(callback, err, null);
      if(result == null) return handleCallback(callback, null, null);
      if(result.result.code) return handleCallback(callback, toError(result.result));
      if(result.result.writeErrors) return handleCallback(callback, toError(result.result.writeErrors[0]));
      // Return the results
      handleCallback(callback, null, result);   
    });
  }

  this.removeOne = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    var options = shallowClone(options);    
    options.single = true;
    this.remove(op.filter, options, function(err, r) {
      if(err) return callback(err);
      r.removedCount = r.result.n;
      callback(null, r);
    });
  }

  this.removeMany = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    var options = shallowClone(options);    
    options.single = false;
    this.remove(op.filter, options, function(err, r) {
      if(err) return callback(err);
      r.removedCount = r.result.n;
      callback(null, r);
    });
  }

  // Remove operations
  this.remove = function(selector, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), db, this, options);

    // If selector is null set empty
    if(selector == null) selector = {};

    // Build the op
    var op = {q: selector, limit: 0};
    if(options.single) op.limit = 1;

    // Execute the remove
    topology.remove(namespace, [op], finalOptions, function(err, result) {
      if(callback == null) return;
      if(err) return handleCallback(callback, err, null);
      if(result == null) return handleCallback(callback, null, null);
      if(result.result.code) return handleCallback(callback, toError(result.result));
      if(result.result.writeErrors) return handleCallback(callback, toError(result.result.writeErrors[0]));
      // Return the results
      handleCallback(callback, null, result);   
    });
  }

  // Save operation
  this.save = function(doc, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), db, this, options);
    // Establish if we need to perform an insert or update
    if(doc._id != null) {
      finalOptions.upsert = true;
      return this.update({_id: doc._id}, doc, finalOptions, callback);
    }

    // Insert the document
    this.insert([doc], options, function(err, r) {
      if(callback == null) return;
      if(doc == null) return handleCallback(callback, null, null);
      if(err) return handleCallback(callback, err, null);
      handleCallback(callback, null, r);
    });
  }

  // findOne operation
  this.findOne = function() {    
    var self = this;
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    var cursor = this.find.apply(this, args).limit(-1).batchSize(1);

    // Return the item
    cursor.nextObject(function(err, item) {
      if(err != null) return handleCallback(callback, toError(err), null);
      handleCallback(callback, null, item);
    });
  }

  this.rename = function(newName, opt, callback) {
    if(typeof opt == 'function') callback = opt, opt = {};
    // Check the collection name
    checkCollectionName(newName);
    // Build the command
    var renameCollection = f("%s.%s", dbName, name);
    var toCollection =  f("%s.%s", dbName, newName);
    var dropTarget = typeof opt.dropTarget == 'boolean' ? opt.dropTarget : false;
    var cmd = {'renameCollection':renameCollection, 'to':toCollection, 'dropTarget':dropTarget};

    // Execute against admin
    db.admin().command(cmd, opt, function(err, doc) {
      if(err) return handleCallback(callback, err, null);
      // We have an error
      if(doc.errmsg) return handleCallback(callback, toError(doc), null);
      try {
        if(opt.new_collection) {
          return handleCallback(callback, null, new Collection(db, topology, dbName, newName, pkFactory, options));
        }
        name = newName;
        handleCallback(callback, null, self);      
      } catch(err) {
        return handleCallback(callback, toError(err), null);
      }
    });
  }

  this.drop = function(callback) {
    db.dropCollection(name, callback);
  }

  this.options = function(callback) {
    db.collectionsInfo(name, function (err, cursor) {
      if(err) return handleCallback(callback, err);
      cursor.nextObject(function (err, document) {
        handleCallback(callback, err, document && document.options || null);
      });
    });
  }

  this.isCapped = function(callback) {
    self.options(function(err, document) {
      if(err) return handleCallback(callback, err);
      handleCallback(callback, null, document && document.capped);
    });    
  }

  this.createIndex = function(fieldOrSpec, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    options = args.length ? args.shift() || {} : {};
    options = typeof callback === 'function' ? options : callback;
    options = options == null ? {} : options;
    // Execute create index
    db.createIndex(name, fieldOrSpec, options, callback);
  }

  this.dropIndex = function(indexName, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    db.dropIndex(name, indexName, options, callback);
  }

  this.dropAllIndexes = function(callback) {
    db.dropIndex(name, '*', function (err, result) {
      if(err) return handleCallback(callback, err, false);
      handleCallback(callback, null, true);
    });
  }

  this.reIndex = function(options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    db.reIndex(name, options, callback);
  }

  this.ensureIndex = function(fieldOrSpec, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};
    db.ensureIndex(name, fieldOrSpec, options, callback);
  }

  this.indexExists = function(indexes, callback) {
    self.indexInformation(function(err, indexInformation) {
      // If we have an error return
      if(err != null) return handleCallback(callback, err, null);
      // Let's check for the index names
      if(!Array.isArray(indexes)) return handleCallback(callback, null, indexInformation[indexes] != null);
      // Check in list of indexes
      for(var i = 0; i < indexes.length; i++) {
        if(indexInformation[indexes[i]] == null) {
          return handleCallback(callback, null, false);
        }
      }

      // All keys found return true
      return handleCallback(callback, null, true);
    });    
  }

  this.indexInformation = function(options, callback) {
    // Unpack calls
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();
    options = args.length ? args.shift() || {} : {};
    // Call the index information
    db.indexInformation(name, options, callback);    
  }

  this.count = function(query, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();
    query = args.length ? args.shift() || {} : {};
    options = args.length ? args.shift() || {} : {};
    var skip = options.skip;
    var limit = options.limit;
    var hint = options.hint;
    var maxTimeMS = options.maxTimeMS;

    // Final query
    var cmd = {
        'count': name, 'query': query
      , 'fields': null
    };

    // Add limit and skip if defined
    if(typeof skip == 'number') cmd.skip = skip;
    if(typeof limit == 'number') cmd.limit = limit;
    if(hint) options.hint = hint;

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Execute command
    db.command(cmd, options, function(err, result) {
      if(err) return handleCallback(callback, err);
      handleCallback(callback, null, result.n);
    });
  };

  this.distinct = function(key, query, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    query = args.length ? args.shift() || {} : {};
    options = args.length ? args.shift() || {} : {};

    // maxTimeMS option
    var maxTimeMS = options.maxTimeMS;

    // Distinct command
    var cmd = {
      'distinct': name, 'key': key, 'query': query
    };

    // We have a crud api object
    if(key != null && key.fieldName) {
      cmd.key = key.fieldName;
      cmd.query = key.filter || {};
      maxTimeMS = key.maxTimeMS || maxTimeMS;
    }

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Execute the command
    db.command(cmd, options, function(err, result) {
      if(err) return handleCallback(callback, err);
      handleCallback(callback, null, result.values);
    });
  };

  this.indexes = function(callback) {
    db.indexInformation(name, {full:true}, callback);    
  }

  this.stats = function(options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();
    // Fetch all commands
    options = args.length ? args.shift() || {} : {};

    // Build command object
    var commandObject = {
      collStats:name
    }

    // Check if we have the scale value
    if(options['scale'] != null) commandObject['scale'] = options['scale'];

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Execute the command
    db.command(commandObject, options, callback);
  }

  this.findOneAndRemove = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    this.findAndModify(
        op.filter
      , op.sort
      , null
      , {
          fields: op.projection
        , remove:true
      }
      , callback
    );
  }

  this.findOneAndReplace = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    this.findAndModify(
        op.filter
      , op.sort
      , op.replacement
      , {
          fields: op.projection
        , update: true
        , new: typeof op.returnReplaced == 'boolean' ? op.returnReplaced : false
        , upsert: typeof op.upsert == 'boolean' ? op.upsert : false
      }
      , callback
    );
  }

  this.findOneAndUpdate = function(op, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    this.findAndModify(
        op.filter
      , op.sort
      , op.update
      , {
          fields: op.projection
        , update: true
        , new: typeof op.returnReplaced == 'boolean' ? op.returnReplaced : false
        , upsert: typeof op.upsert == 'boolean' ? op.upsert : false
      }
      , callback
    );
  }

  this.findAndModify = function(query, sort, doc, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    sort = args.length ? args.shift() || [] : [];
    doc = args.length ? args.shift() : null;
    options = args.length ? args.shift() || {} : {};

    var queryObject = {
       'findandmodify': name
     , 'query': query
    };

    sort = formattedOrderClause(sort);
    if(sort) {
      queryObject.sort = sort;
    }

    queryObject.new = options.new ? true : false;
    queryObject.remove = options.remove ? true : false;
    queryObject.upsert = options.upsert ? true : false;

    if(options.fields) {
      queryObject.fields = options.fields;
    }

    if(doc && !options.remove) {
      queryObject.update = doc;
    }

    // Either use override on the function, or go back to default on either the collection
    // level or db
    if(options['serializeFunctions'] != null) {
      options['serializeFunctions'] = options['serializeFunctions'];
    } else {
      options['serializeFunctions'] = serializeFunctions;
    }

    // No check on the documents
    options.checkKeys = false;

    // Execute the command
    db.command(queryObject
      , options, function(err, result) {
        if(err) return handleCallback(callback, err, null);
        return handleCallback(callback, null, result);
    });
  }

  this.findAndRemove = function(query, sort, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    sort = args.length ? args.shift() || [] : [];
    options = args.length ? args.shift() || {} : {};
    // Add the remove option
    options['remove'] = true;
    // Execute the callback
    this.findAndModify(query, sort, null, options, callback);
  }

  var aggregate = function(cmd, options) {
    options = options || {};
    options = shallowClone(options);

    // Build the command
    var command = { 
        aggregate : name
      , pipeline : cmd ? cmd.pipeline : []
    };

    // Does the topology support an aggregation cursor
    if(topology.capabilities().hasAggregationCursor) {
      command.cursor = {};
      // If we have allowDiskUse defined
      if(cmd && typeof cmd.allowDiskUse == 'boolean') command.allowDiskUse = cmd.allowDiskUse;
      if(cmd && typeof cmd.batchSize == 'number') command.cursor.batchSize = cmd.batchSize;
    }

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Set the AggregationCursor constructor
    options.cursorFactory = AggregationCursor;
    // If explain has been specified add it
    return topology.cursor(namespace, command, options);
  }

  this.aggregate = function(pipeline, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();

    // Crud API defer to aggregate method
    if((callback && callback.pipeline) || args[0] == undefined) 
      return aggregate(pipeline, options);

    // If we have any of the supported options in the options object
    var opts = args[args.length - 1];
    opts = opts || {};
    options = opts.readPreference 
      || opts.explain || opts.cursor || opts.out
      || opts.allowDiskUse ? args.pop() : {}
    // If the callback is the option (as for cursor override it)
    if(typeof callback == 'object' && callback != null) options = callback;

    // Convert operations to an array
    if(!Array.isArray(args[0])) {
      pipeline = [];
      // Push all the operations to the pipeline
      for(var i = 0; i < args.length; i++) pipeline.push(args[i]);
    }

    // If out was specified
    if(typeof options.out == 'string') {
      pipeline.push({$out: options.out});
    }

    // Build the command
    var command = { aggregate : name, pipeline : pipeline};
    // If we have allowDiskUse defined
    if(options.allowDiskUse) command.allowDiskUse = options.allowDiskUse;

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // If explain has been specified add it
    if(options.explain) command.explain = options.explain;

    // Set the AggregationCursor constructor
    options.cursorFactory = AggregationCursor;

    // Is the user requesting a cursor
    if(options.cursor != null && options.out == null 
      && !command.explain
      && topology.capabilities().hasAggregationCursor) {
      command.cursor = options.cursor;
      if(typeof options.allowDiskUse == 'boolean') command.allowDiskUse = options.allowDiskUse;
      // Execute the cursor
      return topology.cursor(namespace, command, options);
    }

    var cursor = null;
    // We do not allow cursor
    if(options.cursor) {
      return topology.cursor(namespace, command, options);
    }

    // Execute the command
    db.command(command, options, function(err, result) {
      if(err) {
        handleCallback(callback, err);
      } else if(result['err'] || result['errmsg']) {
        handleCallback(callback, toError(result));
      } else if(typeof result == 'object' && result['serverPipeline']) {
        handleCallback(callback, null, result['serverPipeline']);
      } else if(typeof result == 'object' && result['stages']) {
        handleCallback(callback, null, result['stages']);
      } else {
        handleCallback(callback, null, result.result);
      }
    });
  }

  this.parallelCollectionScan = function(options, callback) {  
    if(typeof options == 'function') callback = options, options = {numCursors: 1};
    // Set number of cursors to 1
    options.numCursors = options.numCursors || 1;
    options.batchSize = options.batchSize || 1000;

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);
    
    // Create command object
    var commandObject = {
        parallelCollectionScan: name
      , numCursors: options.numCursors
    }

    // Execute the command
    db.command(commandObject, options, function(err, result) {
      if(err) return handleCallback(callback, err, null);
      if(result == null) return handleCallback(callback, new Error("no result returned for parallelCollectionScan"), null);

      var cursors = [];
      // Create command cursors for each item
      for(var i = 0; i < result.cursors.length; i++) {
        var rawId = result.cursors[i].cursor.id
        // Convert cursorId to Long if needed
        var cursorId = typeof rawId == 'number' ? Long.fromNumber(rawId) : rawId;

        // Command cursor options
        var cmd = {
            batchSize: options.batchSize
          , cursorId: cursorId
          , items: result.cursors[i].cursor.firstBatch
        }

        // Add a command cursor
        cursors.push(topology.cursor(namespace, cursorId, options));
      }

      handleCallback(callback, null, cursors);
    });
  }

  this.geoNear = function(x, y, options, callback) {
    var point = typeof(x) == 'object' && x
      , args = Array.prototype.slice.call(arguments, point?1:2);

    callback = args.pop();
    // Fetch all commands
    options = args.length ? args.shift() || {} : {};

    // Build command object
    var commandObject = {
      geoNear:this.collectionName,
      near: point || [x, y]
    }

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Remove read preference from hash if it exists
    commandObject = decorateCommand(commandObject, options, {readPreference: true});

    // Execute the command
    db.command(commandObject, options, function (err, res) {
      if(err) return handleCallback(callback, err);
      if(res.err || res.errmsg) return handleCallback(callback, toError(res));
      // should we only be returning res.results here? Not sure if the user
      // should see the other return information
      handleCallback(callback, null, res);
    });
  }

  this.geoHaystackSearch = function(x, y, options, callback) {
    var args = Array.prototype.slice.call(arguments, 2);
    callback = args.pop();
    // Fetch all commands
    options = args.length ? args.shift() || {} : {};

    // Build command object
    var commandObject = {
      geoSearch: name,
      near: [x, y]
    }

    // Remove read preference from hash if it exists
    commandObject = decorateCommand(commandObject, options, {readPreference: true});

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Execute the command
    db.command(commandObject, options, function (err, res) {
      if(err) return handleCallback(callback, err);
      if(res.err || res.errmsg) handleCallback(callback, utils.toError(res));
      // should we only be returning res.results here? Not sure if the user
      // should see the other return information
      handleCallback(callback, null, res);
    });
  }

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

  this.group = function(keys, condition, initial, reduce, finalize, command, options, callback) {
    var args = Array.prototype.slice.call(arguments, 3);
    callback = args.pop();
    // Fetch all commands
    reduce = args.length ? args.shift() : null;
    finalize = args.length ? args.shift() : null;
    command = args.length ? args.shift() : null;
    options = args.length ? args.shift() || {} : {};

    // Make sure we are backward compatible
    if(!(typeof finalize == 'function')) {
      command = finalize;
      finalize = null;
    }

    if (!Array.isArray(keys) && keys instanceof Object && typeof(keys) !== 'function' && !(keys instanceof Code)) {
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
            'ns': name
          , '$reduce': reduceFunction
          , 'cond': condition
          , 'initial': initial
          , 'out': "inline"
        }
      };

      // if finalize is defined
      if(finalize != null) selector.group['finalize'] = finalize;
      // Set up group selector
      if ('function' === typeof keys || keys instanceof Code) {
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

      // Ensure we have the right read preference inheritance
      options = getReadPreference(options, db, self);
      // Execute command
      db.command(selector, options, function(err, result) {
        if(err) return handleCallback(callback, err, null);
        handleCallback(callback, null, result.retval);
      });
    } else {
      // Create execution scope
      var scope = reduce != null && reduce instanceof Code
        ? reduce.scope
        : {};

      scope.ns = name;
      scope.keys = keys;
      scope.condition = condition;
      scope.initial = initial;

      // Pass in the function text to execute within mongodb.
      var groupfn = groupFunction.replace(/ reduce;/, reduce.toString() + ';');

      db.eval(new Code(groupfn, scope), function (err, results) {
        if (err) return handleCallback(callback, err, null);
        handleCallback(callback, null, results.result || results);
      });
    }
  }

  /**
   * Functions that are passed as scope args must
   * be converted to Code instances.
   * @ignore
   */
  function processScope (scope) {
    if(!isObject(scope)) {
      return scope;
    }

    var keys = Object.keys(scope);
    var i = keys.length;
    var key;
    var new_scope = {};

    while (i--) {
      key = keys[i];
      if ('function' == typeof scope[key]) {
        new_scope[key] = new Code(String(scope[key]));
      } else {
        new_scope[key] = processScope(scope[key]);
      }
    }

    return new_scope;
  }

  this.mapReduce = function(map, reduce, options, callback) {
    if('function' === typeof options) callback = options, options = {};
    // Out must allways be defined (make sure we don't break weirdly on pre 1.8+ servers)
    if(null == options.out) {
      throw new Error("the out option parameter must be defined, see mongodb docs for possible values");
    }

    if('function' === typeof map) {
      map = map.toString();
    }

    if('function' === typeof reduce) {
      reduce = reduce.toString();
    }

    if('function' === typeof options.finalize) {
      options.finalize = options.finalize.toString();
    }

    var mapCommandHash = {
        mapreduce: name
      , map: map
      , reduce: reduce
    };

    // Add any other options passed in
    for(var n in options) {
      if('scope' == n) {
        mapCommandHash[n] = processScope(options[n]);
      } else {
        mapCommandHash[n] = options[n];
      }
    }

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // If we have a read preference and inline is not set as output fail hard
    if((readPreference != false && readPreference != 'primary') 
      && options['out'] && (options['out'].inline != 1 && options['out'] != 'inline')) {
        readPreference = 'primary';    
    }

    // Execute command
    db.command(mapCommandHash, {readPreference:options.readPreference}, function (err, result) {
      if(err) return handleCallback(callback, err);
      // Check if we have an error
      if(1 != result.ok || result.err || result.errmsg) {
        return handleCallback(callback, toError(result));
      }

      // Create statistics value
      var stats = {};
      if(result.timeMillis) stats['processtime'] = result.timeMillis;
      if(result.counts) stats['counts'] = result.counts;
      if(result.timing) stats['timing'] = result.timing;

      // invoked with inline?
      if(result.results) {
        // If we wish for no verbosity
        if(options['verbose'] == null || !options['verbose']) {
          return handleCallback(callback, null, result.results);
        }
        
        return handleCallback(callback, null, result.results, stats);
      }

      // The returned collection
      var collection = null;

      // If we have an object it's a different db
      if(result.result != null && typeof result.result == 'object') {
        var doc = result.result;
        collection = db.db(doc.db).collection(doc.collection);
      } else {
        // Create a collection object that wraps the result collection
        collection = db.collection(result.result)
      }

      // If we wish for no verbosity
      if(options['verbose'] == null || !options['verbose']) {
        return handleCallback(callback, err, collection);
      }

      // Return stats as third set of values
      handleCallback(callback, err, collection, stats);
    });
  }

  this.initializeUnorderedBulkOp = function(options) {
    return unordered(topology, this, options);
  }

  this.initializeOrderedBulkOp = function(options) {
    return ordered(topology, this, options);
  }
}

module.exports = Collection;
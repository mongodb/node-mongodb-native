var checkCollectionName = require('./utils').checkCollectionName
  , ObjectID = require('mongodb-core').BSON.ObjectID
  , f = require('util').format
  , shallowClone = require('./utils').shallowClone
  , toError = require('./utils').toError
  , formattedOrderClause = require('./utils').formattedOrderClause
  , ReadPreference = require('./read_preference')
  , CoreReadPreference = require('mongodb-core').ReadPreference
  , Cursor = require('./cursor')

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

  Object.defineProperty(this, 'writeConcern', {
    enumerable:true,
    get: function() { 
      var ops = {};
      if(options.w) ops.w = options.w;
      if(options.j) ops.w = options.j;
      if(options.fsync) ops.w = options.fsync;
      if(options.wtimeout) ops.w = options.wtimeout;
      return ops;
    }
  })  

  // Get write concern
  var writeConcern = function(target, db, col, options) {
    if(options.w || options.j || options.fsync) {
      target.writeConcern = options;
    } else if(col.writeConcern.w || col.writeConcern.j || col.writeConcern.fsync) {      
      target.writeConcern = col.writeConcern;
    } else if(db.writeConcern.w || db.writeConcern.j || db.writeConcern.fsync) {
      target.writeConcern = db.writeConcern;
    }

    return target
  }

  // Figure out the read preference
  var getReadPreference = function(options, db, coll) {
    var r = null
    if(options.readPreference) r = options.readPreference;
    if(readPreference) r = readPreference;
    if(db.readPreference) r = db.readPreference;
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
    newOptions.hint = options.hint != null ? shared.normalizeHintField(options.hint) : this.internalHint;
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
      if(newOptions[name]) findCommand[name] = newOptions[name];
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
    if(findCommand.fields) findCommand.fields = formatFields(findCommand.fields);
    // Ensure we use the right await data option
    if(newOptions.awaitdata) newOptions.awaitData = newOptions.awaitdata;

    // Add db object to the new options
    newOptions.db = db;

    // Create the cursor
    if(typeof callback == 'function') return callback(null, topology.cursor(namespace, findCommand, newOptions));
    return topology.cursor(namespace, findCommand, newOptions);
  }

  // Insert operations
  this.insert = function(docs, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};
    // Ensure we are operating on an array op docs
    docs = Array.isArray(docs) ? docs : [docs];

    // Do we return the actual result document
    var fullResult = typeof options.fullResult == 'boolean' ? options.fullResult : false;

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), db, this, options);
    if(typeof finalOptions.checkKeys != 'boolean') finalOptions.checkKeys = true;

    // If keep going set unordered
    if(options.keepGoing) finalOptions.ordered = false;
    finalOptions['serializeFunctions'] = options['serializeFunctions'] || serializeFunctions;

    // Add _id if not specified
    for(var i = 0; i < docs.length; i++) {
      if(docs[i]._id == null) docs[i]._id = pkFactory.createPk();
    }

    // File inserts
    topology.insert(namespace, docs, finalOptions, function(err, result) {
      if(callback == null) return;
      if(err) return callback(err);
      if(fullResult) return callback(null, result.result);
      if(result.result.code) return callback(toError(result.result));
      if(result.result.writeErrors) return callback(toError(result.result.writeErrors[0]));
      callback(null, docs);   
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
    var fullResult = typeof options.fullResult == 'boolean' ? options.fullResult : false;

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
      if(err) return callback(err, null);
      if(fullResult) return callback(null, result.result);
      if(result.result.code) return callback(toError(result.result));
      if(result.result.writeErrors) return callback(toError(result.result.writeErrors[0]));
      callback(null, result.result.n);
    });
  }

  // Remove operations
  this.remove = function(selector, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    // Do we return the actual result document
    var fullResult = typeof options.fullResult == 'boolean' ? options.fullResult : false;

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), db, this, options);

    // Build the op
    var op = {q: selector, limit: 0};
    if(options.single) op.limit = 1;

    // Execute the remove
    topology.remove(namespace, [op], finalOptions, function(err, result) {
      if(callback == null) return;
      if(err) return callback(err, null);
      if(fullResult) return callback(null, result.result);
      if(result.result.code) return callback(toError(result.result));
      if(result.result.writeErrors) return callback(toError(result.result.writeErrors[0]));
      callback(null, result.result.n);
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
    this.insert([doc], options, function(err, doc) {
      if(callback == null) return;
      if(err) return callback(err);   
      if(Array.isArray(doc) && doc.length > 0) return callback(null, doc[0]);
      callback(null, doc);
    });
  }

  // /**
  //  * @ignore
  //  */
  // var bindToCurrentDomain = function(callback) {
  //   var domain = process.domain;
  //   if(domain == null || callback == null) {
  //     return callback;
  //   } else {
  //     return domain.bind(callback);
  //   }
  // }  

  // findOne operation
  this.findOne = function() {    
    var self = this;
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    var cursor = this.find.apply(this, args).limit(-1).batchSize(1);

    // Return the item
    cursor.nextObject(function(err, item) {
      if(err != null) return callback(toError(err), null);
      callback(null, item);
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
      if(err) return callback(err, null);
      // We have an error
      if(doc.errmsg) return callback(toError(doc), null);
      try {
        if(opt.new_collection) {
          return callback(null, new Collection(db, topology, dbName, newName, pkFactory, options));
        }
        name = newName;
        callback(null, self);      
      } catch(err) {
        return callback(toError(err), null);
      }
    });
  }

  this.drop = function(callback) {
    db.dropCollection(name, callback);
  }

  this.options = function(callback) {
    db.collectionsInfo(name, function (err, cursor) {
      if(err) return callback(err);      
      cursor.nextObject(function (err, document) {
        callback(err, document && document.options || null);
      });
    });
  }

  this.isCapped = function(callback) {
    self.options(function(err, document) {
      if(err) return callback(err);
      callback(null, document && document.capped);
    });    
  }

  this.createIndex = function(fieldOrSpec, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    options = args.length ? args.shift() || {} : {};
    options = typeof callback === 'function' ? options : callback;
    options = options == null ? {} : options;
    // Execute create index
    db.createIndex(this.collectionName, fieldOrSpec, options, callback);
  }

  this.ensureIndex = function(fieldOrSpec, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};
    // Execute create index
    db.ensureIndex(name, fieldOrSpec, options, callback);
  };

  this.indexExists = function(indexes, callback) {
    self.indexInformation(function(err, indexInformation) {
      // If we have an error return
      if(err != null) return callback(err, null);
      // Let's check for the index names
      if(!Array.isArray(indexes)) return callback(null, indexInformation[indexes] != null);
      // Check in list of indexes
      for(var i = 0; i < indexes.length; i++) {
        if(indexInformation[indexes[i]] == null) {
          return callback(null, false);
        }
      }

      // All keys found return true
      return callback(null, true);
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
    var maxTimeMS = options.maxTimeMS;

    // Final query
    var cmd = {
        'count': name, 'query': query
      , 'fields': null
    };

    // Add limit and skip if defined
    if(typeof skip == 'number') cmd.skip = skip;
    if(typeof limit == 'number') cmd.limit = limit;

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Execute command
    db.command(cmd, options, function(err, result) {
      if(err) return callback(err);
      callback(null, result.n);
    });
  };

  this.distinct = function(key, query, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    query = args.length ? args.shift() || {} : {};
    options = args.length ? args.shift() || {} : {};
    var maxTimeMS = options.maxTimeMS;

    var cmd = {
        'distinct': name, 'key': key, 'query': query
    };

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Execute the command
    db.command(cmd, options, function(err, result) {
      if(err) return callback(err);
      callback(null, result.values);
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
      collStats:this.collectionName,
    }

    // Check if we have the scale value
    if(options['scale'] != null) commandObject['scale'] = options['scale'];

    // Ensure we have the right read preference inheritance
    options = getReadPreference(options, db, self);

    // Execute the command
    db.command(commandObject, options, callback);
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

    queryObject.new = options.new ? 1 : 0;
    queryObject.remove = options.remove ? 1 : 0;
    queryObject.upsert = options.upsert ? 1 : 0;

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
        if(err) return callback(err, null);
        return callback(null, result.value, result);
    });
  }

  this.aggregate = function(pipeline, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();

    // If we have any of the supported options in the options object
    var opts = args[args.length - 1];
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
        callback(err);
      } else if(result['err'] || result['errmsg']) {
        callback(toError(result));
      } else if(typeof result == 'object' && result['serverPipeline']) {
        callback(null, result['serverPipeline']);
      } else if(typeof result == 'object' && result['stages']) {
        callback(null, result['stages']);
      } else {
        callback(null, result.result);
      }
    });
  }  
}

module.exports = Collection;
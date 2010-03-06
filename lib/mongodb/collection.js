var InsertCommand = require('./commands/insert_command').InsertCommand,
  QueryCommand = require('./commands/query_command').QueryCommand,
  DeleteCommand = require('./commands/delete_command').DeleteCommand,
  UpdateCommand = require('./commands/update_command').UpdateCommand,
  DbCommand = require('./commands/db_command').DbCommand,
  BinaryParser = require('./bson/binary_parser').BinaryParser,
  OrderedHash = require('./bson/collections').OrderedHash,
  BSON = require('./bson/bson'),
  ObjectID = BSON.ObjectID,
  Code = BSON.Code,
  Cursor = require('./cursor').Cursor;

/**
  Handles all the operations on objects in collections
**/
var Collection = exports.Collection = function(db, collectionName, pkFactory) {
    this.db = db;
  this.collectionName = collectionName;
  this.internalHint;
  this.pkFactory = pkFactory == null ? ObjectID : pkFactory;
  this.className = "Collection";
  // Add getter and setters
  this.__defineGetter__("hint", function() { return this.internalHint; });
  this.__defineSetter__("hint", function(value) { this.internalHint = this.normalizeHintField(value); });
  // Ensure the collection name is not illegal
  this.checkCollectionName(collectionName);
};

Collection.prototype.insert = function(docs, callback) {
  docs.constructor == Array ? this.insertAll(docs, callback) : this.insertAll([docs], callback);
  return this;
};

Collection.prototype.checkCollectionName = function(collectionName) {
  if(collectionName != null && collectionName.constructor != String) {
    throw Error("collection name must be a String");
  } else if(collectionName == null || collectionName == "" || collectionName.indexOf('..') != -1) {
    throw Error("collection names cannot be empty");
  } else if(collectionName.indexOf('$') != -1 && collectionName.match(/((^\$cmd)|(oplog\.\$main))/) == null) {
    throw Error("collection names must not contain '$'");
  } else if(collectionName.match(/^\./) != null || collectionName.match(/\.$/) != null) {
    throw Error("collection names must not start or end with '.'");
  }
};

Collection.prototype.remove = function(selector, callback) {
  if(callback == null) { callback = selector; selector = null; }

  // Generate selector for remove all if not available
  var removeSelector = selector == null ? {} : selector;
  var deleteCommand = new DeleteCommand(this.db.databaseName + "." + this.collectionName, removeSelector);
  // Execute the command
  this.db.executeCommand(deleteCommand, callback);
  // Callback with no commands
  if(callback != null) callback(null, this);
};

Collection.prototype.rename = function(collectionName, callback) {
  var self = this;

  try {
    this.checkCollectionName(collectionName);
    this.db.renameCollection(this.collectionName, collectionName, function(err, results) {
      if(results[0].documents[0].ok == 0) {
        callback(new Error(results[0].documents[0].errmsg));
      } else {
        // Set collectionname to new one and return the collection
        self.db.collection(collectionName, callback);
      }
    });
  } catch(err) {
    callback(new Error(err.toString()));
  }
};

Collection.prototype.insertAll = function(docs, callback) {
  try {
    // List of all id's inserted
    var objects = [];
    // Create an insert command
    var insertCommand = new InsertCommand(this.db.databaseName + "." + this.collectionName);
    // Add id to each document if it's not already defined
    for(var index = 0; index < docs.length; index++) {
      var doc = docs[index];

      if(!(doc.className == "OrderedHash")) {
        doc._id = doc._id == null ? this.pkFactory.createPk() : doc._id;
      } else {
        // Add the id to the document
        var id = doc.get("_id") == null ? this.pkFactory.createPk() : doc.get("_id");
        doc.add('_id', id);
      }

      // Insert the document
      insertCommand.add(doc);
      objects.push(doc);
    }
    // Execute the command
    this.db.executeCommand(insertCommand);
    // Return the id's inserted calling the callback (mongo does not callback on inserts)
    if(callback != null) callback(null, objects);
  } catch(err) {
    if(callback != null) callback(new Error(err.toString()), null);
  }
};

Collection.prototype.save = function(doc, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : null;

  var id = (doc.className == "OrderedHash") ? doc.get('_id') : doc['_id'];

  if(id != null) {
    this.update({'_id':id}, doc, {'upsert':true, 'safe':options != null ? options['safe'] : false}, callback);
  } else {
    this.insert(doc, callback);
  }
};

/**
  Update a single document in this collection.
    spec - a associcated array containing the fields that need to be present in
      the document for the update to succeed

    document - an associated array with the fields to be updated or in the case of
      a upsert operation the fields to be inserted.

  Options:
    upsert - true/false (perform upsert operation)
    safe - true/false (perform check if the operation failed, required extra call to db)
**/
Collection.prototype.update = function(spec, document, options, callback) {
  if(callback == null) { callback = options; options = null; }
  try {
    var safe = options == null || options['safe'] == null || options['safe'] == false ? false : true;
    // Create update command
    var updateCommand = new UpdateCommand(this.db.databaseName + "." + this.collectionName, spec, document, options);
    // Execute command
    this.db.executeCommand(updateCommand);
    // If safe, we need to check for successful execution
    if(safe) {
      this.db.error(function(documents) {
        if(documents[0].updatedExisting == false) {
          callback(new Error("Failed to update document"), null);
        } else {
          callback(null, document);
        }
      });
    } else {
      // Call back with ok if no error found
      callback(null, document);
    }
  } catch(err) {
    callback(new Error(err.toString()), null);
  }
};

/**
  Fetch a distinct collection
**/
Collection.prototype.distinct = function(key, query, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  query = args.length ? args.shift() : {};

  var mapCommandHash = new OrderedHash();
  mapCommandHash.add('distinct', this.collectionName)
        .add('key', key).add('query', query);

  this.db.executeCommand(DbCommand.createDbCommand(this.db.databaseName, mapCommandHash), function(results) {
    if(results[0].documents[0].ok == 1) {
      callback(null, results[0].documents[0].values);
    } else {
      callback(new Error(results[0].documents[0].errmsg), null);
    }
  });
};

Collection.prototype.count = function(query, callback) {
  if(typeof query === "function") { callback = query; query = null; }
  var query_object = query == null ? new OrderedHash() : query;
  var final_query = new OrderedHash().add("count", this.collectionName).add("query", query_object).add("fields", null);
  // this.findOne(final_query, callback);
  var queryCommand = new QueryCommand(this.db.databaseName + ".$cmd", QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, final_query, null);
  // Execute the command
  this.db.executeCommand(queryCommand, function(results) {
    if(results[0].documents[0].ok == 1) {
      callback(null, results[0].documents[0].n);
    } else {
      callback(new Error(results[0].documents[0].errmsg), null);
    }
  });
};

Collection.prototype.drop = function(callback) {
  this.db.dropCollection(this.collectionName, callback);
};

Collection.prototype.find = function(selector, options, callback) {
  if(typeof selector === "function") { callback = selector; selector = null; options = null; }
  if(typeof options === "function") { callback = options; options = null; }

  if (options == null) options = {};
  // Unpack options
  var fields = options['fields'] != null && options['fields'].length == 0 ? ["_id"] : options['fields'];
  var finalSelector = selector == null ? new OrderedHash() : selector;
  var skip = options['skip'] == null ? 0 : options['skip'];
  var limit = options['limit'] == null ? 0 : options['limit'];
  var sort = options['sort'];
  var explain = options['explain'];
  var snapshot = options['snapshot'];
  var timeout = options['timeout'];
  var finalFields = {};

  var finalHint = options['hint'] != null ? this.normalizeHintField(options['hint']) : this.internalHint;

  // Build the list off options into a object if it's an array (need to encode as BSON object)
  if(fields != null && fields.constructor == Array) {
    fields.forEach(function(field) {
      finalFields[field] = 1;
    });
  } else {
    finalFields = fields;
  }
  // Create cursor
  callback(null, new Cursor(this.db, this, finalSelector, finalFields, skip, limit, sort, finalHint, explain, snapshot, timeout));
};

Collection.prototype.normalizeHintField = function(hint) {
  var finalHint = null;
  // Normalize the hint parameter
  if(hint != null && hint.constructor == String) {
    finalHint = new OrderedHash().add(hint, 1);
  } else if(hint != null && hint.constructor == Object) {
    finalHint = new OrderedHash();
    for(var name in hint) { finalHint.add(name, hint[name]); }
  } else if(hint != null && hint.constructor == Array) {
    finalHint = new OrderedHash();
    hint.forEach(function(param) { finalHint.add(param, 1); });
  }
  return finalHint;
};

Collection.prototype.findOne = function(queryObject, callback) {
  if(callback == null) { callback = queryObject; queryObject = {}; }
  var finalQueryObject = queryObject == null ? {} : queryObject;
  // Validate the type of query
  finalQueryObject = finalQueryObject.className == "ObjectID" ? new OrderedHash().add('_id', finalQueryObject) : finalQueryObject;
  // Execute the command
  var queryCommand = new QueryCommand(this.db.databaseName + "." + this.collectionName, {}, 0, -1, finalQueryObject, null);
  this.db.executeCommand(queryCommand, function(results) {
    callback(null, results[0].documents[0]);
  });
};

Collection.prototype.createIndex = function(fieldOrSpec, unique, callback) {
  this.db.createIndex(this.collectionName, fieldOrSpec, unique, callback);
};

Collection.prototype.indexInformation = function(callback) {
  this.db.indexInformation(this.collectionName, callback);
};

Collection.prototype.dropIndex = function(indexName, callback) {
  this.db.dropIndex(this.collectionName, indexName, callback);
};

Collection.prototype.dropIndexes = function(callback) {
  this.db.dropIndex(this.collectionName, "*", function(results) {
    if(results[0].documents[0].ok == 1) {
      callback(null, true);
    } else {
      callback(new Error("map-reduce failed: " + results[0].documents[0].errmsg), false);
    }
  });
};

Collection.prototype.mapReduce = function(map, reduce, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  var self = this;

  if(typeof map === "function") { map = map.toString(); }
  if(typeof reduce == "function") { reduce = reduce.toString(); }

  // Build command object for execution
  var mapCommandHash = new OrderedHash();
  mapCommandHash.add('mapreduce', this.collectionName)
    .add('map', map)
    .add('reduce', reduce);
  // Add any other options passed in
  for(var name in options) {
    mapCommandHash.add(name, options[name]);
  }
  // Execute command against server
  this.db.executeCommand(DbCommand.createDbCommand(this.db.databaseName, mapCommandHash), function(results) {
    if(results[0].documents[0].ok == 1) {
      // Create a collection object that wraps the result collection
      self.db.collection(results[0].documents[0].result, function(err, collection) {
        callback(null, collection);
      });
    } else {
      callback(new Error("map-reduce failed: " + results[0].documents[0].errmsg), null);
    }
  });
};

Collection.prototype.group = function(keys, condition, initial, reduce, command, callback) {
  var args = Array.prototype.slice.call(arguments, 3);
  callback = args.pop();
  reduce = args.length ? args.shift() : null;
  command = args.length ? args.shift() : null;

  if(command) {
    var hash = new OrderedHash();
    keys.forEach(function(key) {
      hash.add(key, 1);
    });

    var reduceFunction = reduce != null && reduce.className == "Code" ? reduce : new Code(reduce);
    var selector = {'group': {
                      'ns':this.collectionName,
                      '$reduce': reduce,
                      'key':hash,
                      'cond':condition,
                      'initial': initial}};

    this.db.executeCommand(DbCommand.createDbCommand(this.db.databaseName, selector), function(results) {
      var document = results[0].documents[0];
      if(document.retval != null) {
        callback(null, document.retval);
      } else {
        callback(new Error("group command failed: " + document.errmsg), null);
      }
    });
  } else {
    // Create execution scope
    var scope = reduce != null && reduce.className == "Code" ? reduce.scope : new OrderedHash();
    // Create scope for execution
    scope.add('ns', this.collectionName)
      .add('keys', keys)
      .add('condition', condition)
      .add('initial', initial);

    // Define group function
    var groupFunction = function() {
        var c = db[ns].find(condition);
        var map = new Map();
        var reduce_function = reduce;
        while (c.hasNext()) {
            var obj = c.next();

            var key = {};
            for (var i = 0; i < keys.length; i++) {
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
        return {"result": map.values()};
      };

    // Turn function into text and replace the "result" function of the grouping function
    var groupFunctionString = groupFunction.toString().replace(/ reduce;/, reduce.toString() + ';');
    // Execute group
    this.db.eval(new Code(groupFunctionString, scope), function(err, results) {
      if(err instanceof Error) {
        callback(err, null);
      } else {
        if(results.constructor == Object) {
          callback(err, results.result);
        } else {
          callback(err, results);
        }
      }
    });
  }
};

Collection.prototype.options = function(callback) {
  this.db.collectionsInfo(this.collectionName, function(err, cursor) {
    // Fetch the object from the cursor
    cursor.nextObject(function(err, document) {
      callback(null, (document != null ? document.options : document));
    });
  });
};

require('mongodb/commands/insert_command');
require('mongodb/commands/query_command');
require('mongodb/commands/delete_command');
require('mongodb/commands/update_command');
require('mongodb/cursor');

/**
  Handles all the operations on objects in collections
**/

Collection = function(db, collectionName) {
  this.db = db;
  this.collectionName = collectionName;
  this.hint;
};

Collection.prototype = new Object();
Collection.prototype.setHint = function(hint) {
  this.hint = this.normalizeHintField(hint);
}
Collection.prototype.insert = function(docs, callback) {
  docs.constructor == Array ? this.insertAll(docs, callback) : this.insertAll([docs], callback);
  return this;
}

Collection.prototype.remove = function(callback, selector) {
  // Generate selector for remove all if not available
  var removeSelector = selector == null ? {} : selector;
  var deleteCommand = new DeleteCommand(this.db.databaseName + "." + this.collectionName, removeSelector);
  // Execute the command
  this.db.executeCommand(deleteCommand, callback);
  // Callback with no commands
  if(callback != null) callback();
}

Collection.prototype.insertAll = function(docs, callback) {
  // List of all id's inserted
  var objects = [];
  // Create an insert command
  var insertCommand = new InsertCommand(this.db.databaseName + "." + this.collectionName);
  // Add id to each document if it's not already defined
  for(var index in docs) {
    docs[index]["_id"] = docs[index]["_id"] == null ? new ObjectID(null) : docs[index]["_id"];
    insertCommand.add(docs[index]);
    objects.push(docs[index]);
  }  
  // Execute the command
  this.db.executeCommand(insertCommand, callback);
  // Return the id's inserted calling the callback (mongo does not callback on inserts)
  if(callback != null) callback(objects);
}

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
Collection.prototype.update = function(callback, spec, document, options) {
  var safe = options == null || options['safe'] == null || options['safe'] == false ? false : true;
  var updateCommand = new UpdateCommand(this.db.databaseName + "." + this.collectionName, spec, document, options);
  // Execute command
  this.db.executeCommand(updateCommand, callback);    
  // If safe, we need to check for successful execution
  if(safe) {
    this.db.error(function(documents) {
      if(documents[0].errmsg != null) {
        callback({ok:false, err:true, errmsg:documents[0].errmsg});
      }
    });
  }
  // Call back with ok if no error found
  callback({err:false, ok:true});
}

Collection.prototype.count = function(callback, query) {
  var query_object = query == null ? new OrderedHash() : query;    
  var final_query = new OrderedHash().add("count", this.collectionName).add("query", query_object).add("fields", null);
  // this.findOne(final_query, callback);
  var queryCommand = new QueryCommand(this.db.databaseName + ".$cmd", QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, final_query, null);
  // Execute the command
  this.db.executeCommand(queryCommand, function(result) {
    callback(result[0].documents[0].n);
  }); 
}

Collection.prototype.drop = function(callback) {
  this.db.dropCollection(callback, this.collectionName);
}

Collection.prototype.find = function(callback, selector, options) {
  var options = options == null ? {} : options;
  // Unpack options
  var fields = options['fields'] != null && options['fields'].length == 0 ? ["_id"] : options['fields'];
  var finalSelector = selector == null ? new OrderedHash() : selector;
  var skip = options['skip'] == null ? 0 : options['skip'];
  var limit = options['limit'] == null ? 0 : options['limit'];
  var sort = options['sort'];
  // var hint = options['hint'];
  var explain = options['explain'];
  var snapshot = options['snapshot'];
  var timeout = options['timeout'];
  var finalFields = {};
  var finalHint = options['hint'] != null ? this.normalizeHintField(options['hint']) : this.hint;
  
  // Build the list off options into a object if it's an array (need to encode as BSON object)
  if(fields != null && fields.constructor == Array) {
    fields.forEach(function(field) {
      finalFields[field] = 1;
    })
  } else {
    finalFields = fields;
  }

  // Create cursor
  callback(new Cursor(this.db, this, finalSelector, finalFields, skip, limit, sort, finalHint, explain, snapshot, timeout));
}

Collection.prototype.normalizeHintField = function(hint) {
  var finalHint = null;
  // Normalize the hint parameter
  if(hint != null && hint.constructor == String) {
    finalHint = new Object();
    finalHint[hint] = 1;
  } else if(hint != null && hint.constructor == Object) {
    finalHint = hint;    
  } else if(hint != null && hint.constructor == Array) {
    finalHint = new OrderedHash();
    hint.forEach(function(param) { finalHint.add(param, 1); });
  }  
  return finalHint;
}

Collection.prototype.findOne = function(callback, queryObject) {
  // Validate the type of query
  var finalQueryObject = queryObject instanceof ObjectID ? new OrderedHash().add('_id', queryObject) : queryObject;
  finalQueryObject = queryObject == null ? {} : finalQueryObject;
  // Execute the command
  var queryCommand = new QueryCommand(this.db.databaseName + "." + this.collectionName, {}, 0, -1, finalQueryObject, null);    
  this.db.executeCommand(queryCommand, function(documents) {
    callback(documents[0].documents[0]);
  });
}

Collection.prototype.options = function(callback) {
  this.db.collectionsInfo(function(cursor) {
    // Fetch the object from the cursor
    cursor.nextObject(function(document) {
      callback((document != null ? document.options : document));
    });
  }, this.collectionName);
}















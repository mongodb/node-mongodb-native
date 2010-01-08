require('mongodb/commands/insert_command');
require('mongodb/commands/query_command');
require('mongodb/commands/delete_command');
require('mongodb/commands/update_command');

/**
  Handles all the operations on objects in collections
**/

Collection = function(db, collectionName) {
  this.db = db;
  this.collectionName = collectionName;
};

Collection.prototype = new Object();
Collection.prototype.insert = function(docs, callback) {
  docs.constructor == "Array" ? this.insertAll(docs, callback) : this.insertAll([docs], callback);
  // Provde chaining ability
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
  var objects = [new Object()];
  objects[0].documents = [];
  // Create an insert command
  var insertCommand = new InsertCommand(this.db.databaseName + "." + this.collectionName);
  // Add id to each document if it's not already defined
  for(var index in docs) {
    docs[index]["_id"] = docs[index]["_id"] == null ? new ObjectID(null) : new ObjectID(docs[index]["_id"]);
    insertCommand.add(docs[index]);
    var document = new Object();
    document["_id"] = docs[index]["_id"];
    objects[0].documents.push(document);
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
    this.db.error(function(errors) {
      if(errors[0].documents[0].errmsg != null) {
        callback({ok:false, err:true, errmsg:errors[0].documents[0].errmsg});
      }
    });
  }
  // Call back with ok if no error found
  callback({err:false, ok:true});
}

Collection.prototype.findOne = function(query_object, callback) {
  var queryCommand = null;
  // Validate the type of query
  if(query_object instanceof OrderedHash) {
    // Create query command
    queryCommand = new QueryCommand(this.db.databaseName + "." + this.collectionName, {}, 0, -1, query_object, null);    
  } else if(query_object instanceof ObjectID) {
    queryCommand = new QueryCommand(this.db.databaseName + "." + this.collectionName, {}, 0, -1, new OrderedHash().add('_id', query_object), null);    
  }  
  // Execute the command
  this.db.executeCommand(queryCommand, callback);
}
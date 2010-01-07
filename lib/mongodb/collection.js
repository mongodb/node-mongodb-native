require('mongodb/commands/insert_command');
require('mongodb/commands/query_command');

/**
  Handles all the operations on objects in collections
**/

Collection = function(db, collectionName) {
  this.db = db;
  this.collectionName = collectionName;
}

Collection.prototype = new Object();
Collection.prototype.insert = function(docs, callback) {
  docs.constructor == "Array" ? this.insertAll(docs, callback) : this.insertAll([docs], callback);
  // Provde chaining ability
  return this;
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

Collection.prototype.findOne = function(query_object, callback) {
  var queryCommand = null;
  // Validate the type of query
  if(query_object instanceof OrderedHash) {
    // Create query command
    queryCommand = new QueryCommand(this.db.databaseName + "." + this.collectionName, {}, 0, -1, query_object, null);    
  } else if(query_object instanceof ObjectID) {
    queryCommand = new QueryCommand(this.db.databaseName + "." + this.collectionName, {}, 0, -1, new OrderedHash().add('_id', query_object), null);    
  }
  
  // sys.puts("+++++++++++++++++++++++++ " + this.collectionName);
  // sys.puts("=====================================================");
  // new BinaryParser().pprint(queryCommand.toBinary());
  // Execute the command
  this.db.executeCommand(queryCommand, callback);
}
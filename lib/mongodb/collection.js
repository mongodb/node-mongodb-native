var mongo = require('mongodb/commands/insert_command');
process.mixin(mongo, require('mongodb/commands/query_command'));
process.mixin(mongo, require('mongodb/commands/delete_command'));
process.mixin(mongo, require('mongodb/commands/update_command'));
process.mixin(mongo, require('mongodb/commands/db_command'));
process.mixin(mongo, require('mongodb/bson/collections'));
process.mixin(mongo, require('mongodb/bson/bson'));
process.mixin(mongo, require('mongodb/cursor'));

sys = require('sys');

/**
  Handles all the operations on objects in collections
**/
exports.Collection = Class({  
  init: function(db, collectionName, pkFactory) {
    this.db = db;
    this.collectionName = collectionName;
    this.internalHint;
    this.pkFactory = pkFactory == null ? mongo.ObjectID : pkFactory;
    // Add getter and setters
    this.__defineGetter__("hint", function() { return this.internalHint; });
    this.__defineSetter__("hint", function(value) { this.internalHint = this.normalizeHintField(value); });  
    // Ensure the collection name is not illegal
    this.checkCollectionName(collectionName);    
  },
  
  insert: function(docs, callback) {
    docs.constructor == Array ? this.insertAll(docs, callback) : this.insertAll([docs], callback);
    return this;
  },
  
  checkCollectionName: function(collectionName) {
    if(collectionName != null && collectionName.constructor != String) {
      throw Error("collection name must be a String");
    } else if(collectionName == null || collectionName == "" || collectionName.indexOf('..') != -1) {
      throw Error("collection names cannot be empty");
    } else if(collectionName.indexOf('$') != -1 && collectionName.match(/((^\$cmd)|(oplog\.\$main))/) == null) {
      throw Error("collection names must not contain '$'");    
    } else if(collectionName.match(/^\./) != null || collectionName.match(/\.$/) != null) {
      throw Error("collection names must not start or end with '.'");
    }  
  },
  
  remove: function(callback, selector) {
    // Generate selector for remove all if not available
    var removeSelector = selector == null ? {} : selector;
    var deleteCommand = new mongo.DeleteCommand(this.db.databaseName + "." + this.collectionName, removeSelector);
    // Execute the command
    this.db.executeCommand(deleteCommand, callback);
    // Callback with no commands
    if(callback != null) callback(this);
  },
  
  rename: function(callback, collectionName) {
    var self = this;

    try {
      this.checkCollectionName(collectionName);  
      this.db.renameCollection(this.collectionName, collectionName, function(results) {
        if(results[0].documents[0].get('ok') == 0) {
          callback(new Error(results[0].documents[0].get('errmsg')));
        } else {
          // Set collectionname to new one and return the collection        
          self.db.collection(function(collection) {
            callback(collection);          
          }, collectionName)
        }
      });
    } catch(err) {
      callback(new Error(err.toString()));
    }
  }, 
  
  insertAll: function(docs, callback) {
    try {
      // List of all id's inserted
      var objects = [];
      // Create an insert command
      var insertCommand = new mongo.InsertCommand(this.db.databaseName + "." + this.collectionName);
      // Add id to each document if it's not already defined
      for(var index in docs) {
        var doc = docs[index];
        var finalDoc = null;

        if(!(doc instanceof mongo.OrderedHash)) {
          finalDoc = new mongo.OrderedHash();
          // Create ordered hash
          for(var name in doc) {
            finalDoc.add(name, doc[name]);
          }      
        } else {
          finalDoc = doc;
        }

        // Add the id to the document
        var id = finalDoc.get("_id") == null ? this.pkFactory.createPk() : finalDoc.get("_id");      
        finalDoc.add('_id', id);
        // Insert the document
        insertCommand.add(finalDoc);
        objects.push(finalDoc);
      }  
      // Execute the command
      this.db.executeCommand(insertCommand);
      // Return the id's inserted calling the callback (mongo does not callback on inserts)
      if(callback != null) callback(objects);
    } catch(err) {
      if(callback != null) callback(new Error(err.toString()));        
    }
  },
  
  save: function(callback, doc, options) {
    var id = (doc instanceof mongo.OrderedHash) ? doc.get('_id') : doc['_id'];

    if(id != null) {
      this.update(callback, {'_id':id}, doc, {'upsert':true, 'safe':options != null ? options['safe'] : false});
    } else {
      this.insert(doc, callback);
    }
  },
  
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
  update: function(callback, spec, document, options) {
    try {
      var safe = options == null || options['safe'] == null || options['safe'] == false ? false : true;
      // Create update command
      var updateCommand = new mongo.UpdateCommand(this.db.databaseName + "." + this.collectionName, spec, document, options);
      // Execute command
      this.db.executeCommand(updateCommand);
      // If safe, we need to check for successful execution
      if(safe) {
        this.db.error(function(documents) {
          if(documents[0].get('updatedExisting') == false) {
            callback(new Error("Failed to update document"));
          } else {
            callback(document);
          }
        });
      } else {
        // Call back with ok if no error found
        callback(document);    
      }    
    } catch(err) {
      callback(new Error(err.toString()));
    }
  },
  
  count: function(callback, query) {
    var query_object = query == null ? new mongo.OrderedHash() : query;    
    var final_query = new mongo.OrderedHash().add("count", this.collectionName).add("query", query_object).add("fields", null);
    // this.findOne(final_query, callback);
    var queryCommand = new mongo.QueryCommand(this.db.databaseName + ".$cmd", mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, final_query, null);
    // Execute the command
    this.db.executeCommand(queryCommand, function(result) {
      callback(result[0].documents[0].get('n'));
    }); 
  },
  
  drop: function(callback) {
    this.db.dropCollection(callback, this.collectionName);
  },
  
  find: function(callback, selector, options) {
    var options = options == null ? {} : options;
    // Unpack options
    var fields = options['fields'] != null && options['fields'].length == 0 ? ["_id"] : options['fields'];
    var finalSelector = selector == null ? new mongo.OrderedHash() : selector;
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
      })
    } else {
      finalFields = fields;
    }

    // Create cursor
    callback(new mongo.Cursor(this.db, this, finalSelector, finalFields, skip, limit, sort, finalHint, explain, snapshot, timeout));
  },
  
  normalizeHintField: function(hint) {
    var finalHint = null;
    // Normalize the hint parameter
    if(hint != null && hint.constructor == String) {
      finalHint = new mongo.OrderedHash().add(hint, 1);
    } else if(hint != null && hint.constructor == Object) {
      finalHint = new mongo.OrderedHash();    
      for(var name in hint) { finalHint.add(name, hint[name]); }
    } else if(hint != null && hint.constructor == Array) {
      finalHint = new mongo.OrderedHash();
      hint.forEach(function(param) { finalHint.add(param, 1); });
    }  
    return finalHint;
  },
  
  findOne: function(callback, queryObject) {
    // Validate the type of query
    var finalQueryObject = queryObject instanceof mongo.ObjectID ? new mongo.OrderedHash().add('_id', queryObject) : queryObject;
    finalQueryObject = queryObject == null ? {} : finalQueryObject;
    // Execute the command
    var queryCommand = new mongo.QueryCommand(this.db.databaseName + "." + this.collectionName, {}, 0, -1, finalQueryObject, null);    
    this.db.executeCommand(queryCommand, function(documents) {
      callback(documents[0].documents[0]);
    });
  },
  
  createIndex: function(callback, fieldOrSpec, unique) {
    this.db.createIndex(callback, this.collectionName, fieldOrSpec, unique);
  },
  
  indexInformation: function(callback) {
    this.db.indexInformation(callback, this.collectionName);
  },
  
  dropIndex: function(indexName, callback) {
    this.db.dropIndex(this.collectionName, indexName, callback);
  },
  
  group: function(callback, keys, condition, initial, reduce, command) {
    var finalCommand = command == null ? false : command;
    if(command) {
      var hash = new mongo.OrderedHash();
      keys.forEach(function(key) {
        hash.add(key, 1);
      });

      var reduceFunction = reduce != null && reduce instanceof mongo.Code ? reduce : new mongo.Code(reduce);
      var selector = {'group': {
                        'ns':this.collectionName, 
                        '$reduce': reduce,
                        'key':hash,
                        'cond':condition,
                        'initial': initial}};

      this.db.executeCommand(mongo.DbCommand.createDbCommand(this.db.databaseName, selector), function(results) {
        var document = results[0].documents[0];
        if(document.get('retval') != null) {
          callback(document.get('retval'));
        } else {
          callback(new Error("group command failed: " + document.errmsg));
        }
      });              
    } else {
      // Create execution scope
      var scope = reduce != null && reduce instanceof mongo.Code ? reduce.scope : new mongo.OrderedHash();    
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
      this.db.eval(function(results) {
        if(results instanceof mongo.OrderedHash) {
          callback(results.get('result'));        
        } else {
          callback(results);        
        }
      }, new mongo.Code(groupFunctionString, scope));
    }
  }, 
  
  options: function(callback) {
    this.db.collectionsInfo(function(cursor) {
      // Fetch the object from the cursor
      cursor.nextObject(function(document) {
        callback((document != null ? document.get('options') : document));
      });
    }, this.collectionName);
  }
})















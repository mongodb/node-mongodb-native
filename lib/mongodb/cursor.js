var mongo = require('mongodb/commands/query_command');
process.mixin(mongo, require('mongodb/commands/get_more_command'));
process.mixin(mongo, require('mongodb/commands/kill_cursor_command'));
process.mixin(mongo, require('mongodb/bson/collections'));
process.mixin(mongo, require('mongodb/goog/math/integer'));
process.mixin(mongo, require('mongodb/goog/math/long'));

/**
  Handles all the operations on query result using find
**/
exports.Cursor = Class({
  init: function(db, collection, selector, fields, skip, limit, sort, hint, explain, snapshot, timeout) {
    this.db = db;
    this.collection = collection;
    this.selector = selector;
    this.fields = fields;
    this.skipValue = skip == null ? 0 : skip;
    this.limitValue = limit == null ? 0 : limit;
    this.sortValue = sort;
    this.hint = hint;
    this.explainValue = explain;
    this.snapshot = snapshot;
    this.timeout = timeout;  
    this.numberOfReturned = 0;
    this.totalNumberOfRecords = 0;
    this.items = [];
    this.cursorId = mongo.Long.fromInt(0);
    // Keeps track of location of the cursor
    this.index = 0
    // State variables for the cursor
    this.state = exports.Cursor.INIT;
    // Kepp track of the current query run
    this.queryRun = false;
  },
  
  // Return an array of documents
  toArray: function(callback) {
    var self = this;

    try {
      if(self.state != exports.Cursor.CLOSED) {
        self.fetchAllRecords(function(items) {
          self.state = exports.Cursor.CLOSED;
          // Save object in internal cache that can be used for iterating and set index 
          // to first object
          self.index = 0;       
          self.items = items; 
          callback(items);
        });                    
      } else {
        callback(new Error("Cursor is closed"));
      }
    } catch(err) {
      callback(new Error(err.toString()));
    }
  }, 
  
  // For Each materialized the objects at need
  each: function(callback) {
    var self = this;

    if(this.state != exports.Cursor.CLOSED || (this.index <= this.items.length)) {    
      // Fetch the next object until there is no more objects
      self.nextObject(function(item) {            
        if(item != null) {
          callback(item);
          self.each(callback);
        } else {
          self.state = exports.Cursor.CLOSED;
          callback(null);
        }
      });    
    } else {
      callback(new Error("Cursor is closed"));
    }
  },
  
  count: function(callback) {
    this.collection.count(callback, this.selector);
  },
  
  sort: function(callback, keyOrList, direction) {
    if(this.queryRun == true || this.state == exports.Cursor.CLOSED) {
      callback(new Error("Cursor is closed"));
    } else {
      var order = keyOrList;

      if(direction != null) {
        order = [[keyOrList, direction]];
      }
      this.sortValue = order;
      callback(this);
    }    
  },
  
  limit: function(callback, limit) {
    if(this.queryRun == true || this.state == exports.Cursor.CLOSED) {
      callback(new Error("Cursor is closed"));    
    } else {
      if(limit != null && limit.constructor != Number) {
        callback(new Error("limit requires an integer"));
      } else {
        this.limitValue = limit;
        callback(this);      
      }
    }  
  },
  
  skip: function(callback, skip) {
    if(this.queryRun == true || this.state == exports.Cursor.CLOSED) {
      callback(new Error("Cursor is closed"));
    } else {
      if(skip != null && skip.constructor != Number) {
        callback(new Error("skip requires an integer"));
      } else {
        this.skipValue = skip;
        callback(this);      
      }
    }    
  },
  
  generateQueryCommand: function() {
    // Unpack the options
    var timeout  = this.timeout != null ? this.timeout : mongo.QueryCommand.OPTS_NONE;  
    var queryOptions = timeout;

    // Check if we need a special selector
    if(this.sortValue != null || this.explainValue != null || this.hint != null || this.snapshot != null) {
      // Build special selector
      var specialSelector = new mongo.OrderedHash().add('query', this.selector);
      if(this.sortValue != null) specialSelector.add('orderby', this.formattedOrderClause());
      if(this.hint != null && this.hint.constructor == Object) specialSelector.add('$hint', this.hint);
      if(this.explainValue != null) specialSelector.add('$explain', true);
      if(this.snapshot != null) specialSelector.add('$snapshot', true);    
      return new mongo.QueryCommand(this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skipValue, this.limitValue, specialSelector, this.fields);
    } else {
      return new mongo.QueryCommand(this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skipValue, this.limitValue, this.selector, this.fields);
    }
  },
  
  formattedOrderClause: function() {
    var orderBy = new mongo.OrderedHash();
    var self = this;

    if(this.sortValue instanceof Array) {
      this.sortValue.forEach(function(sortElement) {
        if(sortElement.constructor == String) {
          orderBy.add(sortElement, 1);
        } else {
          orderBy.add(sortElement[0], self.formatSortValue(sortElement[1]));
        }    
      });
    } else if(this.sortValue instanceof mongo.OrderedHash) {    
      throw new Error("Invalid sort argument was supplied");
    } else if(this.sortValue.constructor == String) {
      orderBy.add(this.sortValue, 1);
    } else {
      throw Error("Illegal sort clause, must be of the form " + 
        "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]");
    }
    return orderBy;
  },
  
  formatSortValue: function(sortDirection) {
    var value = ("" + sortDirection).toLowerCase();
    if(value == 'ascending' || value == 'asc' || value == 1) return 1;
    if(value == 'descending' || value == 'desc' || value == -1 ) return -1;
    throw Error("Illegal sort clause, must be of the form " + 
      "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]");  
  },
  
  fetchAllRecords: function(callback) {
    var self = this;

    if(self.state == exports.Cursor.INIT) {    
      var queryCommand = self.generateQueryCommand();
      self.db.executeCommand(queryCommand, function(results) {            
        var numberReturned = results[0].numberReturned;
        // Check if we need to fetch the count
        if(self.limitValue > 0 && self.limitValue > numberReturned) {
          self.totalNumberOfRecords = numberReturned;
          self.fetchFirstResults(callback, results);
        } else if(self.limitValue > 0 && self.limitValue <= numberReturned) {
          self.totalNumberOfRecords = self.limitValue;
          self.fetchFirstResults(callback, results);
        } else { 
          self.totalNumberOfRecords = numberReturned;       
          self.fetchFirstResults(callback, results);
        }
      });  
    } else if(self.state == exports.Cursor.OPEN) {    
      if(self.cursorId.greaterThan(mongo.Long.fromInt(0))) {
        // Build get more command
        var getMoreCommand = new mongo.GetMoreCommand(self.db.databaseName + "." + self.collection.collectionName, self.limitValue, self.cursorId);
        // Execute the command
        self.db.executeCommand(getMoreCommand, function(results) {
          self.numberOfReturned = results[0].numberReturned;
          self.cursorId = results[0].cursorId;        
          self.totalNumberOfRecords = self.totalNumberOfRecords + self.numberOfReturned;       
          // Determine if there's more documents to fetch        
          if(self.numberOfReturned > 0 && (self.limitValue == 0 || self.totalNumberOfRecords < self.limitValue)) {          
            results[0].documents.forEach(function(item) { self.items.push(item);})
            self.fetchAllRecords(callback);
          } else {
            // Close the cursor if we still have one
            if(self.cursorId.greaterThan(mongo.Long.fromInt(0))) self.close(function(cursor) {});
            // Return all the items fetched
            callback(self.items);
          }
        });
      } else {
        // Close the cursor as all results have been read
        callback(self.items);
        self.state = exports.Cursor.CLOSED;
      }
    }
  },
  
  fetchFirstResults: function(callback, results) {
    var self = this;
    this.cursorId = results[0].cursorId;   
    this.queryRun = true;
    this.numberOfReturned = results[0].numberReturned;
    this.totalNumberOfRecords = this.numberOfReturned;

    // Add the new documents to the list of items
    results[0].documents.forEach(function(item) { self.items.push(item);})
    // Adjust the state of the cursor
    this.state = exports.Cursor.OPEN;
    // Fetch more records
    this.fetchAllRecords(callback);
  },
  
  nextObject: function(callback) {  
    var self = this;

    // Fetch the first batch of records if none are available
    if(self.state == exports.Cursor.INIT) {   
      // Fetch the total count of object
      try {
        // Execute the first query
        this.fetchAllRecords(function(items) {
          self.items = items;

          if(self.index < items.length) {
            callback(items[self.index++]);
          } else {
            callback(null);
          }
        });        
      } catch(err) {
        callback(new Error(err.toString()));    
      }
    } else {
      if(self.items.length > self.index) {
        callback(self.items[self.index++]);
      } else {
        callback(null);
      }
    }    
  },
  
  explain: function(callback) {
    var limit = (-1)*Math.abs(this.limitValue);
    // Create a new cursor and fetch the plan
    var cursor = new exports.Cursor(this.db, this.collection, this.selector, this.fields, this.skipValue, limit,
        this.sortValue, this.hint, true, this.snapshot, this.timeout);
    cursor.nextObject(function(item) {
      // close the cursor
      cursor.close(function(result) {
        callback(item);
      })
    });
  },
  
  close: function(callback) {
    var self = this;

    // Close the cursor if not needed
    if(self.cursorId instanceof mongo.Long && self.cursorId.greaterThan(new mongo.Long.fromInt(0))) {
      var command = new mongo.KillCursorCommand([self.cursorId]);
      self.db.executeCommand(command, function(results) {});
    }

    self.cursorId = mongo.Long.fromInt(0);
    self.state = exports.Cursor.CLOSED;
    callback(self);
  },
  
  isClosed: function() {
    return this.state == exports.Cursor.CLOSED ? true : false;
  } 
})

// Static variables
exports.Cursor.INIT = 0;
exports.Cursor.OPEN = 1;
exports.Cursor.CLOSED = 2;
























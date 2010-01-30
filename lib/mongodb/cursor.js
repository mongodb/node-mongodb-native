require('mongodb/commands/query_command');
require('mongodb/commands/get_more_command');
require('mongodb/commands/kill_cursor_command');

/**
  Handles all the operations on query result using find
**/

Cursor = function(db, collection, selector, fields, skip, limit, sort, hint, explain, snapshot, timeout) {
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
  this.cursorId = Long.fromInt(0);
  // Keeps track of location of the cursor
  this.index = 0
  // State variables for the cursor
  this.state = Cursor.INIT;
  // Kepp track of the current query run
  this.queryRun = false;
};

// Static variables
Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;

Cursor.prototype = new Object();

// Return an array of documents
Cursor.prototype.toArray = function(callback) {
  var self = this;
  
  try {
    if(self.state != Cursor.CLOSED) {
      self.fetchAllRecords(function(items) {
        self.state = Cursor.CLOSED;
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
}

// For Each materialized the objects at need
Cursor.prototype.each = function(callback) {
  var self = this;

  if(this.state != Cursor.CLOSED || (this.index <= this.items.length)) {    
    // Fetch the next object until there is no more objects
    self.nextObject(function(item) {            
      if(item != null) {
        callback(item);
        self.each(callback);
      } else {
        self.state = Cursor.CLOSED;
        callback(null);
      }
    });    
  } else {
    callback(new Error("Cursor is closed"));
  }
}

Cursor.prototype.count = function(callback) {
  this.collection.count(callback, this.selector);
}

Cursor.prototype.sort = function(callback, keyOrList, direction) {
  if(this.queryRun == true || this.state == Cursor.CLOSED) {
    callback(new Error("Cursor is closed"));
  } else {
    var order = keyOrList;

    if(direction != null) {
      order = [[keyOrList, direction]];
    }
    this.sortValue = order;
    callback(this);
  }    
}

Cursor.prototype.limit = function(callback, limit) {
  if(this.queryRun == true || this.state == Cursor.CLOSED) {
    callback(new Error("Cursor is closed"));    
  } else {
    if(limit != null && limit.constructor != Number) {
      callback(new Error("limit requires an integer"));
    } else {
      this.limitValue = limit;
      callback(this);      
    }
  }  
}

Cursor.prototype.skip = function(callback, skip) {
  if(this.queryRun == true || this.state == Cursor.CLOSED) {
    callback(new Error("Cursor is closed"));
  } else {
    if(skip != null && skip.constructor != Number) {
      callback(new Error("skip requires an integer"));
    } else {
      this.skipValue = skip;
      callback(this);      
    }
  }    
}

Cursor.prototype.generateQueryCommand = function() {
  // Unpack the options
  var timeout  = this.timeout != null ? this.timeout : QueryCommand.OPTS_NONE;  
  var queryOptions = timeout;
  
  // Check if we need a special selector
  if(this.sortValue != null || this.explainValue != null || this.hint != null || this.snapshot != null) {
    // Build special selector
    var specialSelector = new OrderedHash().add('query', this.selector);
    if(this.sortValue != null) specialSelector.add('orderby', this.formattedOrderClause());
    if(this.hint != null && this.hint.constructor == Object) specialSelector.add('$hint', this.hint);
    if(this.explainValue != null) specialSelector.add('$explain', true);
    if(this.snapshot != null) specialSelector.add('$snapshot', true);    
    return new QueryCommand(this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skipValue, this.limitValue, specialSelector, this.fields);
  } else {
    return new QueryCommand(this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skipValue, this.limitValue, this.selector, this.fields);
  }
}

Cursor.prototype.formattedOrderClause = function() {
  var orderBy = new OrderedHash();
  var self = this;
  
  if(this.sortValue instanceof Array) {
    this.sortValue.forEach(function(sortElement) {
      if(sortElement.constructor == String) {
        orderBy.add(sortElement, 1);
      } else {
        orderBy.add(sortElement[0], self.formatSortValue(sortElement[1]));
      }    
    });
  } else if(this.sortValue instanceof OrderedHash) {    
    throw new Error("Invalid sort argument was supplied");
  } else if(this.sortValue.constructor == String) {
    orderBy.add(this.sortValue, 1);
  } else {
    throw Error("Illegal sort clause, must be of the form " + 
      "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]");
  }
  return orderBy;
}

Cursor.prototype.formatSortValue = function(sortDirection) {
  var value = ("" + sortDirection).toLowerCase();
  if(value == 'ascending' || value == 'asc' || value == 1) return 1;
  if(value == 'descending' || value == 'desc' || value == -1 ) return -1;
  throw Error("Illegal sort clause, must be of the form " + 
    "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]");  
}

Cursor.prototype.fetchAllRecords = function(callback) {
  var self = this;

  if(self.state == Cursor.INIT) {    
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
  } else if(self.state == Cursor.OPEN) {    
    if(self.cursorId.greaterThan(Long.fromInt(0))) {
      // Build get more command
      var getMoreCommand = new GetMoreCommand(self.db.databaseName + "." + self.collection.collectionName, self.limitValue, self.cursorId);
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
          if(self.cursorId.greaterThan(Long.fromInt(0))) self.close(function(cursor) {});
          // Return all the items fetched
          callback(self.items);
        }
      });
    } else {
      // Close the cursor as all results have been read
      callback(self.items);
      self.state = Cursor.CLOSED;
    }
  }
}

Cursor.prototype.fetchFirstResults = function(callback, results) {
  var self = this;
  this.cursorId = results[0].cursorId;   
  this.queryRun = true;
  this.numberOfReturned = results[0].numberReturned;
  this.totalNumberOfRecords = this.numberOfReturned;
  
  // Add the new documents to the list of items
  results[0].documents.forEach(function(item) { self.items.push(item);})
  // Adjust the state of the cursor
  this.state = Cursor.OPEN;
  // Fetch more records
  this.fetchAllRecords(callback);
}

Cursor.prototype.nextObject = function(callback) {  
  var self = this;

  // Fetch the first batch of records if none are available
  if(self.state == Cursor.INIT) {   
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
}

Cursor.prototype.explain = function(callback) {
  var limit = (-1)*Math.abs(this.limitValue);
  // Create a new cursor and fetch the plan
  var cursor = new Cursor(this.db, this.collection, this.selector, this.fields, this.skipValue, limit,
      this.sortValue, this.hint, true, this.snapshot, this.timeout);
  cursor.nextObject(function(item) {
    // close the cursor
    cursor.close(function(result) {
      callback(item);
    })
  });
}

Cursor.prototype.close = function(callback) {
  var self = this;
  
  // Close the cursor if not needed
  if(self.cursorId instanceof Long && self.cursorId.greaterThan(new Long.fromInt(0))) {
    var command = new KillCursorCommand([self.cursorId]);
    self.db.executeCommand(command, function(results) {});
  }

  self.cursorId = Long.fromInt(0);
  self.state = Cursor.CLOSED;
  callback(self);
}

Cursor.prototype.isClosed = function() {
  return this.state == Cursor.CLOSED ? true : false;
}

























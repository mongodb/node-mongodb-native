require('mongodb/commands/query_command');
require('mongodb/commands/get_more_command');
require('mongodb/commands/kill_cursor_command');

/**
  Handles all the operations on query result using find
**/

Cursor = function(db, collection, selector, fields, skip, limit, sort, hint, explain, snapshot, timemout) {
  this.db = db;
  this.collection = collection;
  this.selector = selector;
  this.fields = fields;
  this.skip = skip;
  this.limit = limit;
  this.sort = sort;
  this.hint = hint;
  this.explain = explain;
  this.snapshot = snapshot;
  this.timemout = timemout;  
  // State variables for the cursor
  this.state = Cursor.INIT;
  this.numberOfReturned = 0;
  this.count = 0;
  this.items = [];
  // Keeps track of location of the cursor
  this.index = 0
};

// Static variables
Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;

Cursor.prototype = new Object();

// Return an array of documents
Cursor.prototype.toArray = function(callback) {
  try {
    this.fetchAllRecords(callback);      
  } catch(err) {
    callback(err);
  }
}

// For Each materialized the objects at need
Cursor.prototype.each = function(callback) {
  var self = this;
  // Fetch the next object until there is no more objects
  self.nextObject(function(item) {
    if(self.index == self.count) {
      callback(item); callback(null);
    } else {
      callback(item);
      self.each(callback);
    }        
  });
}

Cursor.prototype.generateQueryCommand = function() {
  // Unpack the options
  var timeout  = this.timeout != null ? 0 : QueryCommand.OPTS_NONE;  
  var queryOptions = timeout;
  // Check if we need a special selector
  if(this.sort != null || this.explain != null || this.hint != null || this.snapshot != null) {
    // Build special selector
    var specialSelector = new OrderedHash().add('query', this.selector);
    if(this.sort != null) specialSelector.add('orderby', this.formattedOrderClause());
    if(this.hint != null && this.hint.length) specialSelector.add('$hint', this.hint);
    if(this.explain != null) specialSelector.add('$explain', true);
    if(this.snapshot != null) specialSelector.add('$snapshot', true);
    return new QueryCommand(this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skip, this.limit, specialSelector, this.fields);
  } else {
    return new QueryCommand(this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skip, this.limit, this.selector, this.fields);
  }
}

Cursor.prototype.formattedOrderClause = function() {
  var orderBy = new OrderedHash();
  var self = this;
  
  if(this.sort instanceof Array) {
    this.sort.forEach(function(sortElement) {
      if(sortElement.constructor == String) {
        orderBy.add(sortElement, 1);
      } else {
        orderBy.add(sortElement[0], self.sortValue(sortElement[1]));
      }    
    });
  } else if(this.sort instanceof OrderedHash) {
    throw new Error("Invalid sort argument was supplied");
  } else {
    orderBy.add(this.sort, 1);
  }  
  return orderBy;
}

Cursor.prototype.sortValue = function(sortDirection) {
  var value = ("" + sortDirection).toLowerCase();
  if(value == 'ascending' || value == 'asc' || value == 1) return 1;
  if(value == 'descending' || value == 'desc' || value == -1 ) return -1;
}

Cursor.prototype.fetchAllRecords = function(callback) {
  var self = this;

  if(self.state == Cursor.INIT) {    
    var queryCommand = self.generateQueryCommand();
    // sys.puts("=-----------------------------------------------");
    // new BinaryParser().pprint(queryCommand.toBinary());
    self.db.executeCommand(queryCommand, function(results) {            
      var numberReturned = results[0].numberReturned;
      // Check if we need to fetch the count
      if(self.limit > 0 && self.limit > numberReturned) {
        self.count = numberReturned;
        self.fetchFirstResults(callback, results);
      } else if(self.limit > 0 && self.limit <= numberReturned) {
        self.count = self.limit;
        self.fetchFirstResults(callback, results);
      } else {
        self.collection.count(function(count) {
          self.count = count;
          self.fetchFirstResults(callback, results);
        }, self.selector);
      }
    });  
  } else if(self.state == Cursor.OPEN) {
    if(self.cursorId > 0) {
      // Build get more command
      var getMoreCommand = new GetMoreCommand(self.db.databaseName + "." + self.collection.collectionName, self.limit, self.cursorId);
      // Execute the command
      self.db.executeCommand(getMoreCommand, function(results) {
        results[0].documents.forEach(function(document) {
          self.items.push(document.toArray());
          self.numberOfReturned = self.numberOfReturned + 1;
        });
        // Determine if there's more documents to fetch
        if(self.numberOfReturned < self.count) {
          self.fetchAllRecords(callback);
        } else {
          callback(self.items);
        }
      });
    } else {
      // Close the cursor as all results have been read
      self.state = Cursor.CLOSED;
    }
  }
}

Cursor.prototype.fetchFirstResults = function(callback, results) {
  var self = this;

  self.cursorId = results[0].cursorId;      
  results[0].documents.forEach(function(document) {
    self.items.push(document.toArray());
    self.numberOfReturned = self.numberOfReturned + 1;
  });
  // Adjust the state of the cursor
  self.state = Cursor.OPEN;
  // Determine if there's more documents to fetch
  if(self.limit == 0 && self.numberOfReturned < self.count) {
    self.fetchAllRecords(callback);
  } else {
    callback(self.items);
  }  
}

Cursor.prototype.nextObject = function(callback) {  
  var self = this;
  // Fetch the first batch of records if none are available
  if(self.state == Cursor.INIT) {   
    // Fetch the total count of object
    self.collection.count(function(count) {
      // Get total count of all objects in query
      self.count = count;
      // Execute the first query
      self.fetchAllRecords(function(items) {
        self.items = items;

        if(self.index < items.length) {
          callback(items[self.index++]);
        } else {
          callback(null);
        }
      });
    }); 
  } else {
    if(self.index < self.count && self.items.length > self.index) {
      callback(self.items[self.index++]);
    }
  }
}


























require('mongodb/commands/query_command');
require('mongodb/commands/get_more_command');
require('mongodb/commands/kill_cursor_command');

/**
  Handles all the operations on query result using find
**/

Cursor = function(db, collection, selector, fields, skip, limit, sort, hint, snapshot, timemout) {
  this.db = db;
  this.collection = collection;
  this.selector = selector;
  this.fields = fields;
  this.skip = skip;
  this.limit = limit;
  this.sort = sort;
  this.hint = hint;
  this.snapshot = snapshot;
  this.timemout = timemout;  
  // State variables for the cursor
  this.state = Cursor.INIT;
  this.numberOfReturned = 0;
  this.count = 0;
  this.items = [];
};

// Static variables
Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;

Cursor.prototype = new Object();

// Return an array of documents
Cursor.prototype.toArray = function(callback) {
  var self = this;  
  // Check the total number of objects for this query
  var command = this.collection.count(function(count) {
    // Save the number of records for the query
    self.count = count;    
    // Fetch the records
    self.fetchAllRecords(callback);
  }, this.selector);  
}

Cursor.prototype.fetchAllRecords = function(callback) {
  // Unpack the options
  var timeout  = this.timeout ? 0 : QueryCommand.OPTS_NONE;  
  var queryOptions = timeout;
  var self = this;

  if(self.state == Cursor.INIT) {      
    var queryCommand = new QueryCommand(self.db.databaseName + "." + self.collection.collectionName, queryOptions, self.skip, self.limit, self.selector, self.fields);
    self.db.executeCommand(queryCommand, function(results) {
      self.cursorId = results[0].cursorId;      
      results[0].documents.forEach(function(document) {
        self.items.push(document.toArray());
        self.numberOfReturned = self.numberOfReturned + 1;
      });
      // Adjust the state of the cursor
      self.state = Cursor.OPEN;
      // Determine if there's more documents to fetch
      if(self.numberOfReturned < self.count) {
        self.fetchAllRecords(callback);
      } else {
        callback(self.items);
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


























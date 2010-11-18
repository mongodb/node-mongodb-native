var QueryCommand = require('./commands/query_command').QueryCommand,
  GetMoreCommand = require('./commands/get_more_command').GetMoreCommand,
  KillCursorCommand = require('./commands/kill_cursor_command').KillCursorCommand,
  Integer = require('./goog/math/integer').Integer,
  Long = require('./goog/math/long').Long;

/**
  Handles all the operations on query result using find
**/
var Cursor = exports.Cursor = function(db, collection, selector, fields, skip, limit, sort, hint, explain, snapshot, timeout, tailable) {
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
  this.tailable = tailable;

  this.totalNumberOfRecords = 0;
  this.items = [];
  this.cursorId = Cursor.ZEROID;

  // State variables for the cursor
  this.state = Cursor.INIT;
  // Kepp track of the current query run
  this.queryRun = false;
};

  // Return an array of documents
Cursor.prototype.toArray = function(callback) {
  var self = this;

  try {
    if(self.state != Cursor.CLOSED) {
      var items = [];
      self.each(function(err, item) {
          if (item != null) {
              items.push(item);
          } else {
              callback(null, items);
          }
      });
    } else {
      callback(new Error("Cursor is closed"), null);
    }
  } catch(err) {
    callback(new Error(err.toString()), null);
  }
};

// For Each materialized the objects at need
Cursor.prototype.each = function(callback) {
  var self = this;

  if(this.state != Cursor.CLOSED) {
    // Fetch the next object until there is no more objects
    self.nextObject(function(err, item) {
      if(item != null) {
        callback(null, item);
        self.each(callback);
      } else {
        self.state = Cursor.CLOSED;
        callback(null, null);
      }
    });
  } else {
    callback(new Error("Cursor is closed"), null);
  }
};

Cursor.prototype.count = function(callback) {
  this.collection.count(this.selector, callback);
};

Cursor.prototype.sort = function(keyOrList, direction, callback) {
  callback = callback || function(){};
  if(typeof direction === "function") { callback = direction; direction = null; }
  if(this.queryRun == true || this.state == Cursor.CLOSED) {
    callback(new Error("Cursor is closed"), null);
  } else {
    var order = keyOrList;

    if(direction != null) {
      order = [[keyOrList, direction]];
    }
    this.sortValue = order;
    callback(null, this);
  }
  return this;
};

Cursor.prototype.limit = function(limit, callback) {
  callback = callback || function(){};
  if(this.queryRun == true || this.state == Cursor.CLOSED) {
    callback(new Error("Cursor is closed"), null);
  } else {
    if(limit != null && limit.constructor != Number) {
      callback(new Error("limit requires an integer"), null);
    } else {
      this.limitValue = limit;
      callback(null, this);
    }
  }
  return this;
};

Cursor.prototype.skip = function(skip, callback) {
  callback = callback || function(){};
  if(this.queryRun == true || this.state == Cursor.CLOSED) {
    callback(new Error("Cursor is closed"), null);
  } else {
    if(skip != null && skip.constructor != Number) {
      callback(new Error("skip requires an integer"), null);
    } else {
      this.skipValue = skip;
      callback(null, this);
    }
  }
  return this;
};

Cursor.prototype.generateQueryCommand = function() {
  // Unpack the options
  var queryOptions = QueryCommand.OPTS_NONE;
  if (this.timeout != null) queryOptions += this.timeout;
  if (this.tailable != null) queryOptions += QueryCommand.OPTS_TAILABLE_CURSOR;

  // Check if we need a special selector
  if(this.sortValue != null || this.explainValue != null || this.hint != null || this.snapshot != null) {
    // Build special selector
    var specialSelector = {'query':this.selector};
    if(this.sortValue != null) specialSelector['orderby'] = this.formattedOrderClause();
    if(this.hint != null && this.hint.constructor == Object) specialSelector['$hint'] = this.hint;
    if(this.explainValue != null) specialSelector['$explain'] = true;
    if(this.snapshot != null) specialSelector['$snapshot'] = true;

    return new QueryCommand(this.db, this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skipValue, this.limitValue, specialSelector, this.fields);
  } else {
    return new QueryCommand(this.db, this.db.databaseName + "." + this.collection.collectionName, queryOptions, this.skipValue, this.limitValue, this.selector, this.fields);
  }
};

Cursor.prototype.formattedOrderClause = function() {
  var orderBy = {};
  var self = this;

  if(this.sortValue instanceof Array) {
    this.sortValue.forEach(function(sortElement) {
      if(sortElement.constructor == String) {
        orderBy[sortElement] = 1;
      } else {
        orderBy[sortElement[0]] = self.formatSortValue(sortElement[1]);
      }
    });
  } else if(Object.prototype.toString.call(this.sortValue) === '[object Object]') {
    throw new Error("Invalid sort argument was supplied");
  } else if(this.sortValue.constructor == String) {
    orderBy[this.sortValue] = 1
  } else {
    throw Error("Illegal sort clause, must be of the form " +
      "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]");
  }
  return orderBy;
};

Cursor.prototype.formatSortValue = function(sortDirection) {
  var value = ("" + sortDirection).toLowerCase();
  if(value == 'ascending' || value == 'asc' || value == 1) return 1;
  if(value == 'descending' || value == 'desc' || value == -1 ) return -1;
  throw Error("Illegal sort clause, must be of the form " +
    "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]");
};

Cursor.prototype.nextObject = function(callback) {
  var self = this;
  if(self.state == Cursor.INIT) {
    try {
      var queryCommand = self.generateQueryCommand();
      self.db.executeCommand(queryCommand, function(err, result) {
        self.queryRun = true;
        self.state = Cursor.OPEN; // Adjust the state of the cursor
        self.cursorId = result.cursorId;
        self.totalNumberOfRecords = result.numberReturned;

        // Add the new documents to the list of items
        self.items = self.items.concat(result.documents);
        self.items.length && callback(null, self.items.shift());
      });
    } catch(err) {
      callback(new Error(err.toString()), null);
    }
  } else if(self.items.length) {
    callback(null, self.items.shift());
  } else if(self.cursorId.greaterThan(Cursor.ZEROID)) {
    try {
      self.getMore(callback);
    } catch(err) {
      callback(new Error(err.toString()), null);
    }
  } else {
    self.state = Cursor.CLOSED;
    callback(null, null);
  }
}

Cursor.prototype.getMore = function(callback) {
  var self = this;
  var limit = 0;
  if (self.limitValue > 0) {
    limit = self.limitValue - self.totalNumberOfRecords;
    if (limit < 1) {
      self.close();
      callback(null, null);
    }
  }
  var getMoreCommand = new GetMoreCommand(self.db, self.db.databaseName + "." + self.collection.collectionName, limit, self.cursorId);
  // Execute the command
  self.db.executeCommand(getMoreCommand, function(err, result) {
    self.cursorId = result.cursorId;
    self.totalNumberOfRecords += result.numberReturned;
    // Determine if there's more documents to fetch
    if(result.numberReturned > 0) {
      self.items = self.items.concat(result.documents);
      callback(null, self.items.shift());
    } else {
      self.close();
      callback(null, null);
    }
  });
}

Cursor.prototype.explain = function(callback) {
  var limit = (-1)*Math.abs(this.limitValue);
  // Create a new cursor and fetch the plan
  var cursor = new Cursor(this.db, this.collection, this.selector, this.fields, this.skipValue, limit,
      this.sortValue, this.hint, true, this.snapshot, this.timeout);
  cursor.nextObject(function(err, item) {
    // close the cursor
    cursor.close(function(err, result) {
      callback(null, item);
    });
  });
};

Cursor.prototype.streamRecords = function(options) {
  var args = Array.prototype.slice.call(arguments, 0);
  options = args.length ? args.shift() : {};

  var
    self = this,
    stream = new process.EventEmitter(),
    recordLimitValue = this.limitValue || 0,
    emittedRecordCount = 0,
    queryCommand = this.generateQueryCommand();

  // see http://www.mongodb.org/display/DOCS/Mongo+Wire+Protocol
  queryCommand.numberToReturn = options.fetchSize ? options.fetchSize : 500;

  execute(queryCommand);

  function execute(command) {
    self.db.executeCommand(command, function(err,result) {
      if (!self.queryRun && result) {
        self.queryRun = true;
        self.cursorId = result.cursorId;
        self.state = Cursor.OPEN;
        self.getMoreCommand = new GetMoreCommand(self.db, self.db.databaseName + "." + self.collection.collectionName, queryCommand.numberToReturn, result.cursorId);
      }
      if (result.documents && result.documents.length) {
        try {
          result.documents.forEach(function(doc){
            if (recordLimitValue && emittedRecordCount>=recordLimitValue) {
              throw("done");
            }
            emittedRecordCount++;
            stream.emit('data', doc);
          });
        } catch(err) {
          if (err != "done") { throw err; }
          else {
            stream.emit('end', recordLimitValue);
            self.close(function(){});
            return(null);
          }
        }
        // rinse & repeat
        execute(self.getMoreCommand);
      } else {
        self.close(function(){
          stream.emit('end', recordLimitValue);
        });
      }
    });
  }
  return stream;
};

Cursor.prototype.close = function(callback) {
  // Close the cursor if not needed
  if(this.cursorId instanceof Long && this.cursorId.greaterThan(Cursor.ZEROID)) {
    var command = new KillCursorCommand(this.db, [this.cursorId]);
    this.db.executeCommand(command, function(err, result) {});
  }

  this.cursorId = Cursor.ZEROID;
  this.state = Cursor.CLOSED;
  if (callback) callback(null, this);
};

Cursor.prototype.isClosed = function() {
  return this.state == Cursor.CLOSED ? true : false;
};

// Static variables
Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;
Cursor.ZEROID = Long.fromInt(0);

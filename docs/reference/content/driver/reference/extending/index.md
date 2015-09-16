+++
date = "2015-03-19T12:53:30-04:00"
title = "Extending Cursors"
[menu.main]
  parent = "Sync Reference"
  identifier = "Sync Extending Cursors"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# Extending the functionality of the Driver Cursor

The Core Driver cursor is a very minimalist cursor by design and only supports a single `next` method to iterate over the query results. In this tutorial we will examine how we can extend the cursor to support an additional `toArray` method and show how we can configure our topology to always return the new extended Cursor on all `cursor` method calls.

Let's look at the code.

```js
var Server = require('mongodb-core').Server
  , Cursor = require('mongodb-core').Cursor
  , inherits = require('util').inherits

//
// Create an extended cursor that adds a toArray function
var ExtendedCursor = function(bson, ns, cmd, options, connection, callbacks, options) {
  Cursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;

  // Resolve all the next
  var getAllNexts = function(items, callback) {
    self.next(function(err, item) {
      if(err) return callback(err);
      if(item == null) return callback(null, null);
      items.push(item);
      getAllNexts(items, callback);
    });
  }

  // Adding a toArray function to the cursor
  this.toArray = function(callback) {
    var items = [];

    getAllNexts(items, function(err, r) {
      if(err) return callback(err, null);          
      callback(null, items);
    });
  }
}

// Extend the Cursor
inherits(ExtendedCursor, Cursor);

// Connect using new cursor
var server = new Server({
    host: 'localhost'
  , port: 27017
  , cursorFactory: ExtendedCursor
});

// Wait for the connection event
server.on('connect', function(_server) {
  // Execute find
  var cursor = _server.cursor('db.test', {
      find: f("%s.inserts_extend_cursors", configuration.db)
    , query: {}
  });

  // Execute next
  cursor.toArray(function(err, items) {
    test.equal(null, err);

    // Execute find
    var cursor = _server.cursor('db.test', {
        find: f("%s.inserts_extend_cursors", configuration.db)
      , query: {}
    }, {cursorFactory: ExtendedCursor});

    // Execute next
    cursor.toArray(function(err, items) {
      test.equal(null, err);
      server.destroy();
    });
  });
});

// Start connecting
server.connect();
```

It's fairly straight forward to create the new cursor factory. We extend the `Cursor` class and add the new `toArray` method. We then specify the new `ExtendedCursor` factory as the `cursorFactory` when we create the new `Server` connection. From then on every time we call the `cursor` method we receive an instance of the `ExtendedCursor` that we specified. We can even override a specific `cursor` method call by passing it a different `cursorFactory` in the options allowing for complete flexibility in using different types of cursor.

That covers how to customize the cursor for your needs.


+++
date = "2015-03-19T12:53:30-04:00"
title = "CRUD Operations"
[menu.main]
  parent = "Sync Reference"
  identifier = "Sync CRUD Operations"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# CRUD

The Core Driver CRUD operations are defined by the methods available on the driver topologies in the form of the `insert`, `update`, `remove`, `cursor` and `command`.

## Inserting Documents

Inserting documents is fairly straightforward. Let's look at an example.

```js
var Server = require('mongodb-core').Server
  , assert = require('assert');

var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Execute the insert
  server.insert('integration_tests.inserts_example1', [{a:1}], {
    writeConcern: {w:1}, ordered:true
  }, function(err, results) {
    assert.equal(null, err);
    assert.equal(1, results.result.n);

    server.destroy();
  });
});

// Start connecting
server.connect();
```

The insert method takes an array of documents to insert and an additional options object containing the write concern and if the commands are executed in order or not.

* `writeConcern.w` **{string|number}** The write concern, either a number or a name like *majority*.
* `writeConcern.wtimeout` **{number}** The write concern max timeout.
* `writeConcern.j` **{boolean}** Wait for write to journal.
* `writeConcern.fsync` **{boolean}** Wait for fsync (deprecated).
* `order` **{boolean, default:true}** Execute the inserts in order or out of order.

## Updating Documents

Updating documents is also fairly straightforward with the main difference being that the actual documents passed in need a specific set of options for each operation.

### Update operation document
An update operation document is made up of the following fields.

* `q` **{object}** The query object to select the document(s) to update.
* `u` **{object}** The update statement to be applied to the document(s) selected by the query.
* `multi` **{boolean, default:false}** Update one or one and more documents.

Let's look at a simple code example.

```js
var Server = require('mongodb-core').Server
  , assert = require('assert');

var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Execute the update
  server.update('integration_tests.inserts_example2', [{
    q: {a: 1}, u: {'$set': {b:1}}, multi:true
  }], {
    writeConcern: {w:1}, ordered:true
  }, function(err, results) {
    assert.equal(null, err);
    server.destroy();
  });
});

// Start connecting
server.connect();
```

The options are the same as for the insert operation.

* `writeConcern.w` **{string|number}** The write concern, either a number or a name like *majority*.
* `writeConcern.wtimeout` **{number}** The write concern max timeout.
* `writeConcern.j` **{boolean}** Wait for write to journal.
* `writeConcern.fsync` **{boolean}** Wait for fsync (deprecated).
* `order` **{boolean, default:true}** Execute the inserts in order or out of order.

## Removing Documents

Removing documents is also fairly straightforward with the main difference being that the actual documents passed in need a specific set of options for each operation.

### Remove operation document
A remove operation document is made up of the following fields.

* `q` **{object}** The query object to select the document(s) to remove.
* `limit` **{number, default:1}** Remove one or all matching documents. Possible values are 1 or 0.

Let's look at a simple code example.

```js
var Server = require('mongodb-core').Server
  , assert = require('assert');

var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Execute the update
  server.remove('integration_tests.inserts_example2', [{
    q: {a: 1}, limit:1
  }], {
    writeConcern: {w:1}, ordered:true
  }, function(err, results) {
    assert.equal(null, err);
    server.destroy();
  });
});

// Start connecting
server.connect();
```

The options are the same as for the insert and update operation.

* `writeConcern.w` **{string|number}** The write concern, either a number or a name like *majority*.
* `writeConcern.wtimeout` **{number}** The write concern max timeout.
* `writeConcern.j` **{boolean}** Wait for write to journal.
* `writeConcern.fsync` **{boolean}** Wait for fsync (deprecated).
* `order` **{boolean, default:true}** Execute the inserts in order or out of order.

## Executing a Command against MongoDB

Executing a command is also fairly straightforward but allows for the usage of readPreferences. The Core driver does not enforce the correct readPreferences on write commands so be aware that you need to ensure a `findAndModify` command is correctly routed to a primary instead of a secondary when the topology is a replicaset. Let's look at an example.

```js
var Server = require('mongodb-core').Server
  , ReadPreference = require('mongodb-core').ReadPreference
  , assert = require('assert');

var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Execute the command
  server.command("system.$cmd"
    , {ismaster: true}
    , {
      readPreference: new ReadPreference('secondary')
    }, function(err, result) {
      assert.equal(null, err)
      server.destroy();
  });
});

// Start connecting
server.connect();
```

The first parameter is the database to execute the command against. This is typically the special `system.$cmd` collection. It accepts a command and an options object that can contain the following options.

* `readPreference`, **{ReadPreference}** Specify read preference if command supports it
* `connection` **{Connection}** Specify connection object to execute command against

## Executing Queries against MongoDB

Executing queries against MongoDB is done using the `cursor` method on the topology. The cursor can then be used with the `next` method to iterate over all the results. The Low level Core driver does not implement streams or other methods this is left to library developers to implement by extending the cursor using the `cursorFactory` option. Let's look at a simple example first and then look at the options available.

```js
var Server = require('mongodb-core').Server
  , ReadPreference = require('mongodb-core').ReadPreference
  , assert = require('assert');

var server = new Server({host: 'localhost', port: 27017});
// Wait for the connection event
server.on('connect', function(server) {
  // Execute the write
  var cursor = _server.cursor('integration_tests.inserts_example4', {
      find: 'integration_tests.example4'
    , query: {a:1}
  }, {
    readPreference: new ReadPreference('secondary');
  });

  // Get the first document
  cursor.next(function(err, doc) {
    assert.equal(null, err);
    server.destroy();
  });
});

// Start connecting
server.connect();
```

The cursor accepts commands that return a cursor id such as the `aggregation` command and the virtual `find` command or a `Long` cursorId that signals an existing cursor where we start iterating using the `getmore` command. We can also optionally pass in an array of documents that represents a first batch or even just an array of documents to emulate a cursor.

The following options can be set on a cursor.

* `readPreference`, **{ReadPreference}** Specify read preference if command supports it.
* `batchSize`, **{number, default:0}** Batchsize for the operation.
* `documents`, **{object[]}** Initial documents list for cursor.

### The Virtual Find Method

To simplify the way the code is we have defined the current way of doing queries in MongoDB as a virtual find command. This find command is a document with the following fields.

* `find` {string} The namespace where the query is executed against. **db.collection**.
* `query` {object} The query criteria/selector for the cursor.
* `limit` {number, default:0} The number of documents to limit the query too.
* `skip` {number, default:0} The number of documents to skip.
* `fields` {object} The projection of the returned documents.
* `hint` {object|string} The index hint to use with the query.
* `explain` {boolean} Execute the query using explain.
* `snapshot` {boolean} Execute the query as a snapshot.
* `batchSize` {number, default:0} The batch size to use on the getMore commands.
* `returnKey` {boolean} Return only the key for each document.
* `maxScan` {number} Constrain the query only to scan a max number of documents before stopping.
* `min` {number} Specify the minimum inclusive lower bound for a specific index  in order to constrain the results.
* `max` {number} Specify the maximum inclusive upper bound for a specific index  in order to constrain the results.
* `showDiskLoc` {boolean} Return the disk location for all the documents.
* `command` {string} Print comment to log when query is executed.
* `maxTimeMS` {number} Terminate the query after X milliseconds.
* `raw` {boolean, default:false} Return raw BSON document Buffers instead of parsing them into JS objects.
* `readPreference` {ReadPreference} Set the read preference for the query.
* `tailable` {boolean} Create a tailable cursor against the collection.
* `oplogReplay` {boolean} Signal that we wish to perform an op log replay.
* `noCursorTimeout` {boolean} Signal that we do not wish the cursor to time out.
* `awaitdata` {boolean} Signal that we wish to perform an awaitData on a tailable cursor.
* `exhaust` {boolean} Perform an exhaust query.
* `partial` {boolean} Allow a partial result to be returned from a sharded system.

This concludes the CRUD commands documentation.
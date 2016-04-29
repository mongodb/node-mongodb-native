+++
date = "2015-03-19T12:53:30-04:00"
title = "CRUD Operations"
[menu.main]
  parent = "ECMAScript 6"
  identifier = "CRUD"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# ECMAScript 6 CRUD

Let's take a look at the CRUD operations from the perspective of ECMAScript 6. In this guide we will be using the same examples as in the general CRUD specification overview but rewrite them to use the new ECMAScript 6 features. For all method options refer to the main CRUD tutorial.

- [CRUD]({{<relref "tutorials/crud.md">}}): CRUD Specification.

This reference also obmits methods that no longer make sense when using ECMAScript 6 such as the `each` and `forEach` methods.

## Inserting Documents
The *insertOne* and *insertMany* methods exists on the *Collection* class and is used to insert documents into MongoDB. Code speaks a thousand words so let's see two simple examples of inserting documents.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Insert a single document
  var r = yield db.collection('inserts').insertOne({a:1});
  assert.equal(1, r.insertedCount);

  // Insert multiple documents
  var r = yield db.collection('inserts').insertMany([{a:2}, {a:3}]);
  assert.equal(2, r.insertedCount);

  // Close connection
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

Let's look at a simple example where we are writing to a replicaset and we wish to ensure that we serialize a passed in function as well as have the server assign the *_id* for each document.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Insert a single document
  var r = yield db.collection('inserts').insertOne({
        a:1
      , b: function() { return 'hello'; }
    }, {
        w: 'majority'
      , wtimeout: 10000
      , serializeFunctions: true
      , forceServerObjectId: true
    });

  assert.equal(1, r.insertedCount);
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

That wraps up the *insert* methods. Next let's look at the *update* methods.

## Updating Documents
The *updateOne* and *updateMany* methods exists on the *Collection* class and is used to update and upsert documents into MongoDB. Let's look at a couple of usage examples.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the updates collection
  var col = db.collection('updates');
  // Insert a single document
  var r = yield col.insertMany([{a:1}, {a:2}, {a:2}]);
  assert.equal(3, r.insertedCount);

  // Update a single document
  var r = yield col.updateOne({a:1}, {$set: {b: 1}});
  assert.equal(1, r.matchedCount);
  assert.equal(1, r.modifiedCount);

  // Update multiple documents
  var r = yield col.updateMany({a:2}, {$set: {b: 1}});
  assert.equal(2, r.matchedCount);
  assert.equal(2, r.modifiedCount);

  // Upsert a single document
  var r = yield col.updateOne({a:3}, {$set: {b: 1}}, {
    upsert: true
  });
  assert.equal(0, r.matchedCount);
  assert.equal(1, r.upsertedCount);
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

## Removing Documents
The *deleteOne* and *deleteMany* methods exist on the *Collection* class and is used to remove documents from MongoDB. Let's look at a couple of usage examples.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the removes collection
  var col = db.collection('removes');
  // Insert a single document
  var r = yield col.insertMany([{a:1}, {a:2}, {a:2}]);
  assert.equal(3, r.insertedCount);

  // Remove a single document
  var r = yield col.deleteOne({a:1});
  assert.equal(1, r.deletedCount);

  // Update multiple documents
  var r = yield col.deleteMany({a:2});
  assert.equal(2, r.deletedCount);
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

## findOneAndUpdate, findOneAndDelete and findOneAndReplace
The three methods *findOneAndUpdate*, *findOneAndDelete* and *findOneAndReplace* are special commands that allows the user to update or upsert a document and have the modified or existing document returned. It comes at a cost as the operation takes a write lock for the duration of the operation as it needs to ensure the modification is *atomic*. Let's look at *findOneAndUpdate* first using an example.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the findAndModify collection
  var col = db.collection('findAndModify');
  // Insert a single document
  var r = yield col.insert([{a:1}, {a:2}, {a:2}]);
  assert.equal(3, r.result.n);

  // Modify and return the modified document
  var r = yield col.findOneAndUpdate({a:1}, {$set: {b: 1}}, {
      returnOriginal: false
    , sort: [[a,1]]
    , upsert: true
  });
  assert.equal(1, r.value.b);

  // Remove and return a document
  var r = yield col.findOneAndDelete({a:2});
  assert.ok(r.value.b == null);
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

The *findOneAndDelete* function is a function especially defined to help remove a document. Let's look at an example of usage.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the findAndModify collection
  var col = db.collection('findAndModify');
  // Insert a single document
  var r = yield col.insert([{a:1}, {a:2}, {a:2}]);
  assert.equal(3, r.result.n);

  // Remove a document from MongoDB and return it
  var r = yield col.findOneAndDelete({a:1}, {
      sort: [[a,1]]
    });
  assert.ok(r.value.b == null);
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

## BulkWrite
The *bulkWrite* function allows for a simple set of bulk operations to be done in a non fluent way as in comparison to the bulk API discussed next. Let's look at an example.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the collection
  var col = db.collection('bulk_write');
  var r = yield col.bulkWrite([
      { insertOne: { document: { a: 1 } } }
    , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
    , { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
    , { deleteOne: { filter: {c:1} } }
    , { deleteMany: { filter: {c:1} } }
    , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}]
  , {ordered:true, w:1});
  assert.equal(1, r.insertedCount);
  assert.equal(1, Object.keys(r.insertedIds).length);
  assert.equal(1, r.matchedCount);
  assert.equal(0, r.modifiedCount);
  assert.equal(0, r.deletedCount);
  assert.equal(2, r.upsertedCount);
  assert.equal(2, Object.keys(r.upsertedIds).length);

  // Ordered bulk operation
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

This covers the basic write operations. Let's have a look at the Bulk write operations next.

## Bulk Write Operations
The bulk write operations make it easy to write groups of operations together to MongoDB. There are some caveats and to get the best performance you need to be running against MongoDB *2.6* or higher that support the new write commands. Bulk operations are split into *ordered* and *unordered* bulk operations. An *ordered* bulk operation guarantees the order of execution of writes while the *unordered* bulk operation makes no assumptions about the order of execution. In the Node.js driver the *unordered* bulk operations will group operations according to type and write them in parallel. Let's have a look at how to build an ordered bulk operation.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the collection
  var col = db.collection('bulkops');
  // Create ordered bulk, for unordered initializeUnorderedBulkOp()
  var bulk = col.initializeOrderedBulkOp();
  // Insert 10 documents
  for(var i = 0; i < 10; i++) {
    bulk.insert({a: i});
  }

  // Next perform some upserts
  for(var i = 0; i < 10; i++) {
    bulk.find({b:i}).upsert().updateOne({b:1});
  }

  // Finally perform a remove operation
  bulk.find({b:1}).deleteOne();

  // Execute the bulk with a journal write concern
  var result = yield bulk.execute();
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

We will not cover the results object here as it's documented in the driver API. The Bulk API handles all the splitting of operations into multiple writes and also emulates 2.6 and higher write commands for 2.4 and earlier servers.

There are some important things to keep in mind when using the bulk API and especially the *ordered* bulk API mode. The write commands are single operation type. That means they can only do insert/update and remove. If you f.ex do the following combination of operations.

    Insert {a:1}
    Update {a:1} to {a:1, b:1}
    Insert {a:2}
    Remove {b:1}
    Insert {a:3}

This will result in the driver issuing 4 write commands to the server.

    Insert Command with {a:1}
    Update Command {a:1} to {a:1, b:1}
    Insert Command with {a:2}
    Remove Command with {b:1}
    Insert Command with {a:3}    

If you instead organize your *ordered* in the following manner.

    Insert {a:1}
    Insert {a:2}
    Insert {a:3}
    Update {a:1} to {a:1, b:1}
    Remove {b:1}

The number of write commands issued by the driver will be.

    Insert Command with {a:1}, {a:2}, {a:3}
    Update Command {a:1} to {a:1, b:1}
    Remove Command with {b:1}

Allowing for more efficient and faster bulk write operation.

For *unordered* bulk operations this is not important as the driver sorts operations by type and executes them in parallel.

This covers write operations for MongoDB. Let's look at querying for documents next.

## Read Methods
The main method for querying the database are the *find* and the *aggregate* method. In this CRUD tutorial we will focus on *find*.

The *method* return a cursor that allows us to operate on the data. The *cursor* also implements the Node.js 0.10.x or higher stream interface allowing us to pipe the results to other streams.

Let's look at a simple find example that materializes all the documents from a query using the toArray but limits the number of returned results to 2 documents.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the collection
  var col = db.collection('find');
  // Insert a single document
  var r = yield col.insertMany([{a:1}, {a:1}, {a:1}]);
  assert.equal(3, r.insertedCount);

  // Get first two documents that match the query
  var docs = yield col.find({a:1}).limit(2).toArray();
  assert.equal(2, docs.length);
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

Next lets take a look at the *next* method and how we can iterate over the cursor in ECMAScript 6. The new `generator` functions allow for what is arguably a much cleaner and easier to read iteration code.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");

  // Get the collection
  var col = db.collection('find');
  // Insert a single document
  var r = yield col.insertMany([{a:1}, {a:1}, {a:1}]);
  assert.equal(3, r.insertedCount);

  // Get the cursor
  var cursor = col.find({a:1}).limit(2);

  // Iterate over the cursor
  while(yield cursor.hasNext()) {
    var doc = yield cursor.next();
    console.dir(doc);
  }

  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

## Executing Commands
The `Db.command` method also returns a `Promise` allowing us to leverage `generators` to get clear and concise code. Below is an example calling the `buildInfo` method.

```js
var MongoClient = require('mongodb').MongoClient,
  co = require('co'),
  assert = require('assert');

co(function*() {
  // Connection URL
  var db = yield MongoClient.connect('mongodb://localhost:27017/myproject');
  console.log("Connected correctly to server");
  // Use the admin database for the operation
  var adminDb = db.admin();
  // Retrive the build information using the admin command
  yield adminDb.command({buildInfo:1})
  db.close();
}).catch(function(err) {
  console.log(err.stack);
});
```

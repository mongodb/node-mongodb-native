+++
date = "2015-03-19T12:53:30-04:00"
title = "CRUD Operations"
[menu.main]
  parent = "Reference"
  identifier = "CRUD Operations"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# CRUD

For a walkthrough of the main CRUD operations please refer to the [Quick Tour]({{< ref "getting-started/quick-start.md" >}}).

The driver crud operations are defined as the operations performed to insert/update/remove and query for documents. In this tutorial we will cover both the basic CRUD methods as well as the specialized *findAndModify* based methods and the new Bulk API methods allowing for efficient bulk write operations. But let's start with a simple introduction to the insert, update and remove operations that are on the collection class.

## Write Methods

### Inserting Documents
The *insertOne* and *insertMany* methods exists on the *Collection* class and is used to insert documents into MongoDB. Code speaks a thousand words so let's see two simple examples of inserting documents.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Insert a single document
  db.collection('inserts').insertOne({a:1}, function(err, r) {
    assert.equal(null, err);
    assert.equal(1, r.insertedCount);

    // Insert multiple documents
    db.collection('inserts').insertMany([{a:2}, {a:3}], function(err, r) {
      assert.equal(null, err);
      assert.equal(2, r.insertedCount);

      db.close();
    });
  });
});
```

The first insert inserts a single document into the *inserts* collection. Notice that we are not explicitly creating a new *inserts* collection as the server will create it implicitly when we insert the first document. The method `Db.createIndex` only really needs to be used when creating non standard collections such as capped collections or where other parameters than the default collections need to be applied.

The *insertOne* and *insertMany* methods also accepts an second argument that can be an options object. This object can have the following fields.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `serializeFunctions` | (Boolean, default:false) | serialize functions on an object to mongodb, by default the driver does not serialize any functions on the passed in documents. |
| `forceServerObjectId` | (Boolean, default:false) | Force server to assign _id values instead of driver. |

Let's look at a simple example where we are writing to a replicaset and we wish to ensure that we serialize a passed in function as well as have the server assign the *_id* for each document.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Insert a single document
  db.collection('inserts').insertOne({
        a:1
      , b: function() { return 'hello'; }
    }, {
        w: 'majority'
      , wtimeout: 10000
      , serializeFunctions: true
      , forceServerObjectId: true
    }, function(err, r) {
    assert.equal(null, err);
    assert.equal(1, r.insertedCount);
    db.close();
  });
});
```

That wraps up the *insert* methods. Next let's look at the *update* methods.

### Updating Documents
The *updateOne* and *updateMany* methods exists on the *Collection* class and is used to update and upsert documents into MongoDB. Let's look at a couple of usage examples.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('updates');
  // Insert a single document
  col.insertMany([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Update a single document
    col.updateOne({a:1}, {$set: {b: 1}}, function(err, r) {
      assert.equal(null, err);
      assert.equal(1, r.matchedCount);
      assert.equal(1, r.modifiedCount);

      // Update multiple documents
      col.updateMany({a:2}, {$set: {b: 1}}, function(err, r) {
        assert.equal(null, err);
        assert.equal(2, r.matchedCount);
        assert.equal(2, r.modifiedCount);

        // Upsert a single document
        col.updateOne({a:3}, {$set: {b: 1}}, {
          upsert: true
        }, function(err, r) {
          assert.equal(null, err);
          assert.equal(0, r.matchedCount);
          assert.equal(1, r.upsertedCount);
          db.close();
        });
      });
    });
  });
});
```

The *update* method also accepts a third argument that can be an options object. This object can have the following fields.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `multi` | (Boolean, default:false) | Update one/all documents with operation. |
| `upsert` | (Boolean, default:false) | Update operation is an upsert. |

Just as for *insert* the *update* method allows you to specify a per operation write concern using the *w*, *wtimeout* and *fsync* parameters

### Removing Documents
The *deleteOne* and *deleteMany* methods exist on the *Collection* class and is used to remove documents from MongoDB. Let's look at a couple of usage examples.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('removes');
  // Insert a single document
  col.insertMany([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Remove a single document
    col.deleteOne({a:1}, function(err, r) {
      assert.equal(null, err);
      assert.equal(1, r.deletedCount);

      // Update multiple documents
      col.deleteMany({a:2}, function(err, r) {
        assert.equal(null, err);
        assert.equal(2, r.deletedCount);
        db.close();
      });
    });
  });
});
```

The *deleteOne* and *deleteMany* methods also accepts a second argument that can be an options object. This object can have the following fields.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `single` | (Boolean, default:false) | Removes the first document found. |

Just as for *updateOne/updateMany* and *insertOne/insertMany* the *deleteOne/deleteMany* method allows you to specify a per operation write concern using the *w*, *wtimeout* and *fsync* parameters

### findOneAndUpdate, findOneAndDelete and findOneAndReplace
The three methods *findOneAndUpdate*, *findOneAndDelete* and *findOneAndReplace* are special commands that allows the user to update or upsert a document and have the modified or existing document returned. It comes at a cost as the operation takes a write lock for the duration of the operation as it needs to ensure the modification is *atomic*. Let's look at *findOneAndUpdate* first using an example.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('findAndModify');
  // Insert a single document
  col.insert([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Modify and return the modified document
    col.findOneAndUpdate({a:1}, {$set: {b: 1}}, {
        returnOriginal: false
      , sort: [[a,1]]
      , upsert: true
    }, function(err, r) {
      assert.equal(null, err);
      assert.equal(1, r.value.b);

      // Remove and return a document
      col.findOneAndDelete({a:2}, function(err, r) {
        assert.equal(null, err);
        assert.ok(r.value.b == null);
        db.close();
      });
    });
  });
});
```

The *findOneAndUpdate* method also accepts a third argument that can be an options object. This object can have the following fields.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `upsert` | (Boolean, default:false) | Perform an upsert operation. |
| `sort` | (Object, default:null) | Sort for find operation. |
| `projection` | (Object, default:null) | Projection for returned result |
| `returnOriginal` | (Boolean, default:true) | Set to false if you want to return the modified object rather than the original. Ignored for remove. |

The *findOneAndDelete* function is a function especially defined to help remove a document. Let's look at an example of usage.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('findAndModify');
  // Insert a single document
  col.insert([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Remove a document from MongoDB and return it
    col.findOneAndDelete({a:1}, {
        sort: [[a,1]]
      }
      , function(err, r) {
        assert.equal(null, err);
        assert.ok(r.value.b == null);
        db.close();
    });
  });
});
```

Just as for *findOneAndUpdate* it allows for an object of options to be passed in that can have the following fields.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `sort` | (Object, default:null) | Sort for find operation. |

### BulkWrite
The *bulkWrite* function allows for a simple set of bulk operations to be done in a non fluent way as in comparison to the bulk API discussed next. Let's look at an example.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  // Get the collection
  var col = db.collection('bulk_write');
  col.bulkWrite([
      { insertOne: { document: { a: 1 } } }
    , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
    , { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
    , { deleteOne: { filter: {c:1} } }
    , { deleteMany: { filter: {c:1} } }
    , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}]
  , {ordered:true, w:1}, function(err, r) {
    assert.equal(null, err);
    assert.equal(1, r.insertedCount);
    assert.equal(1, Object.keys(r.insertedIds).length);
    assert.equal(1, r.matchedCount);
    assert.equal(0, r.modifiedCount);
    assert.equal(0, r.deletedCount);
    assert.equal(2, r.upsertedCount);
    assert.equal(2, Object.keys(r.upsertedIds).length);

    // Ordered bulk operation
    db.close();
  });
});
```

As we can see the *bulkWrite* function takes an array of operation that can be objects of either *insertOne*, *insertMany*, *updateOne*, *updateMany*, *deleteOne* or *deleteMany*. It also takes a second parameter that takes the following options.

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `ordered` | (Boolean, default:true) | Execute in order or out of order. |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |

This covers the basic write operations. Let's have a look at the Bulk write operations next.

## Bulk Write Operations
The bulk write operations make it easy to write groups of operations together to MongoDB. There are some caveats and to get the best performance you need to be running against MongoDB *2.6* or higher that support the new write commands. Bulk operations are split into *ordered* and *unordered* bulk operations. An *ordered* bulk operation guarantees the order of execution of writes while the *unordered* bulk operation makes no assumptions about the order of execution. In the Node.js driver the *unordered* bulk operations will group operations according to type and write them in parallel. Let's have a look at how to build an ordered bulk operation.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

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
  bulk.execute(function(err, result) {
    assert.equal(null, err);
    db.close();
  });
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
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('find');
  // Insert a single document
  col.insertMany([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Get first two documents that match the query
    col.find({a:1}).limit(2).toArray(function(err, docs) {
      assert.equal(null, err);
      assert.equal(2, docs.length);
      db.close();
    });
  });
});
```

The cursor returned by the *find* method has a lot of methods that allow for chaining of options for a query. Once the query is ready to be executed you can retrieve the documents using the *next*, *each* and *toArray* methods. If the query returns a lot of documents it's preferable to use the *next* or *each* methods as the *toArray* method will materialize all the documents into memory before calling the callback function potentially using a lot of memory if the query returns a lot of documents.

Let's look at some of the options we can set on the cursor.

```js
collection.find({}).project({a:1})                             // Create a projection of field a
collection.find({}).skip(1).limit(10)                          // Skip 1 and limit 10
collection.find({}).batchSize(5)                               // Set batchSize on cursor to 5
collection.find({}).filter({a:1})                              // Set query on the cursor
collection.find({}).comment('add a comment')                   // Add a comment to the query, allowing to correlate queries
collection.find({}).addCursorFlag('tailable', true)            // Set cursor as tailable
collection.find({}).addCursorFlag('oplogReplay', true)         // Set cursor as oplogReplay
collection.find({}).addCursorFlag('noCursorTimeout', true)     // Set cursor as noCursorTimeout
collection.find({}).addCursorFlag('awaitData', true)           // Set cursor as awaitData
collection.find({}).addCursorFlag('exhaust', true)             // Set cursor as exhaust
collection.find({}).addCursorFlag('partial', true)             // Set cursor as partial
collection.find({}).addQueryModifier('$orderby', {a:1})        // Set $orderby {a:1}
collection.find({}).max(10)                                    // Set the cursor maxScan
collection.find({}).maxScan(10)                                // Set the cursor maxScan
collection.find({}).maxTimeMS(1000)                            // Set the cursor maxTimeMS
collection.find({}).min(100)                                   // Set the cursor min
collection.find({}).returnKey(10)                              // Set the cursor returnKey
collection.find({}).setReadPreference(ReadPreference.PRIMARY)  // Set the cursor readPreference
collection.find({}).showRecordId(true)                         // Set the cursor showRecordId
collection.find({}).snapshot(true)                             // Set the cursor snapshot
collection.find({}).sort([['a', 1]])                           // Sets the sort order of the cursor query
collection.find({}).hint('a_1')                                // Set the cursor hint
```

All options are chainable, so one can combine settings in the following way.

```js
collection.find({}).maxTimeMS(1000).maxScan(100).skip(1).toArray(..)
```

More information can be found in the [Cursor API documentation](/node-mongodb-native/2.0/api/Cursor.html).

We already looked at *toArray* method above. Let's take a look at the *next* method.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('find');
  // Insert a single document
  col.insertMany([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Get first documents from cursor
    col.find({a:1}).limit(2).next(function(err, doc) {
      assert.equal(null, err);
      assert.ok(doc != null);
      db.close();
    });
  });
});
```

The *next* method allows the application to read one document at a time using callbacks. Let's look at the *each* method next.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('find');
  // Insert a single document
  col.insertMany([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Get first documents from cursor using each
    col.find({a:1}).limit(2).each(function(err, doc) {
      if(doc) {
        db.close();
        // Got a document, terminate the each
        return false;
      }
    });
  });
});
```

The *each* method will call the supplied callback until there are no more documents available that satisfy the query. Once the available documents is exhausted it will return *null* for the second parameter in the callback. If you wish to terminate the each early you should return false in your *each* callback. This will stop the cursor from returning documents.

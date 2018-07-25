+++
date = "2015-03-19T12:53:30-04:00"
title = "CRUD Operations"
[menu.main]
  parent = "ECMAScript Next"
  identifier = "CRUD"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# ECMAScript Next CRUD

Let's take a look at the CRUD operations from the perspective of ESNext. In this guide we will be using the same examples as in the general CRUD specification overview but rewrite them to use the new ESNext features. For all method options refer to the main CRUD tutorial.

- [CRUD]({{<relref "tutorials/crud.md">}}): CRUD Specification.

This reference also omits methods that no longer make sense when using ESNext such as the `each` and `forEach` methods.

## Inserting Documents
The *insertOne* and *insertMany* methods exist on the *Collection* class and are used to insert documents into MongoDB. Code speaks a thousand words so let's see two simple examples of inserting documents.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Insert a single document
    let r = await db.collection('inserts').insertOne({a:1});
    assert.equal(1, r.insertedCount);

    // Insert multiple documents
    r = await db.collection('inserts').insertMany([{a:2}, {a:3}]);
    assert.equal(2, r.insertedCount);
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

Let's look at a simple example where we are writing to a replicaset and we wish to ensure that we serialize a passed in function as well as have the server assign the *_id* for each document.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Insert a single document
    const r = await db.collection('inserts').insertOne({
        a:1,
        b: function() { return 'hello'; }
      }, {
        w: 'majority',
        wtimeout: 10000,
        serializeFunctions: true,
        forceServerObjectId: true
      }
    );

    assert.equal(1, r.insertedCount);
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

That wraps up the *insert* methods. Next let's look at the *update* methods.

## Updating Documents
The *updateOne* and *updateMany* methods exist on the *Collection* class and are used to update and upsert documents into MongoDB. Let's look at a couple of usage examples.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);
    const col = db.collection('updates');
    let r;

    // Insert multiple documents
    r = await col.insertMany([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.insertedCount);

    // Update a single document
    r = await col.updateOne({a:1}, {$set: {b: 1}});
    assert.equal(1, r.matchedCount);
    assert.equal(1, r.modifiedCount);

    // Update multiple documents
    r = await col.updateMany({a:2}, {$set: {b: 1}});
    assert.equal(2, r.matchedCount);
    assert.equal(2, r.modifiedCount);

    // Upsert a single document
    r = await col.updateOne({a:3}, {$set: {b: 1}}, {upsert: true});
    assert.equal(0, r.matchedCount);
    assert.equal(1, r.upsertedCount);
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

## Removing Documents
The *deleteOne* and *deleteMany* methods exist on the *Collection* class and are used to remove documents from MongoDB. Let's look at a couple of usage examples.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Get the removes collection
    const col = db.collection('removes');
    let r;

    // Insert multiple documents
    r = await col.insertMany([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.insertedCount);

    // Remove a single document
    r = await col.deleteOne({a:1});
    assert.equal(1, r.deletedCount);

    // Remove multiple documents
    r = await col.deleteMany({a:2});
    assert.equal(2, r.deletedCount);
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

## findOneAndUpdate, findOneAndDelete and findOneAndReplace
The three methods *findOneAndUpdate*, *findOneAndDelete* and *findOneAndReplace* are special commands that allow the user to update or upsert a document and have the modified or existing document returned. They come at a cost because the operations take a write lock for the duration of the operation as they need to ensure the modification is *atomic*. Let's look at *findOneAndUpdate* first using an example.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Get the findAndModify collection
    const col = db.collection('findAndModify');
    let r;

    // Insert multiple documents
    r = await col.insert([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.result.n);

    // Modify and return the modified document
    r = await col.findOneAndUpdate({a:1}, {$set: {b: 1}}, {
      returnOriginal: false,
      sort: [['a',1]],
      upsert: true
    });
    assert.equal(1, r.value.b);

  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

The *findOneAndDelete* function is especially defined to help remove a document. Let's look at an example of usage.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Get the findAndModify collection
    const col = db.collection('findAndModify');
    let r;

    // Insert multiple documents
    r = await col.insert([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.result.n);

    // Remove a document from MongoDB and return it
    r = await col.findOneAndDelete({a:1});
    assert.ok(r.value.b == null);
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

## BulkWrite
The *bulkWrite* function allows for a simple set of bulk operations to be done in a non [fluent](https://en.wikipedia.org/wiki/Fluent_interface) way, as compared with the *bulk* API discussed next. Let's look at an example.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Get the collection
    const col = db.collection('bulk_write');

    const r = await col.bulkWrite([
        { insertOne: { document: { a: 1 } } },
        { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } },
        { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } },
        { deleteOne: { filter: {c:1} } },
        { deleteMany: { filter: {c:1} } },
        { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}
      ],
      {ordered:true, w:1}
    );
    assert.equal(1, r.insertedCount);
    assert.equal(1, Object.keys(r.insertedIds).length);
    assert.equal(1, r.matchedCount);
    assert.equal(0, r.modifiedCount);
    assert.equal(0, r.deletedCount);
    assert.equal(2, r.upsertedCount);
    assert.equal(2, Object.keys(r.upsertedIds).length);
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

This covers the basic write operations. Let's have a look at the Bulk write operations next.

## Bulk Write Operations
The bulk write operations make it easy to write groups of operations together to MongoDB. There are some caveats and to get the best performance you need to be running against MongoDB *2.6* or higher, which supports the new write commands. Bulk operations are split into *ordered* and *unordered* bulk operations. An *ordered* bulk operation guarantees the order of execution of writes while the *unordered* bulk operation makes no assumptions about the order of execution. In the Node.js driver the *unordered* bulk operations will group operations according to type and write them in parallel. Let's have a look at how to build an ordered bulk operation.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Get the collection
    const col = db.collection('bulkops');

    // Create ordered bulk, for unordered initializeUnorderedBulkOp()
    const bulk = col.initializeOrderedBulkOp();
    // Insert 10 documents
    for(let i = 0; i < 10; i++) {
      bulk.insert({a: i});
    }

    // Next perform some upserts
    for(let i = 0; i < 10; i++) {
      bulk.find({b:i}).upsert().updateOne({b:1});
    }

    // Finally perform a remove operation
    bulk.find({b:1}).deleteOne();

    // Execute the bulk with a journal write concern
    const result = await bulk.execute();
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

We will not cover the results object here as it's documented in the driver API. The Bulk API handles all the splitting of operations into multiple writes.

There are some important things to keep in mind when using the bulk API and especially the *ordered* bulk API mode. The write commands are insert, update and remove. They will be serially executed in the order they are added, creating a new operation for each switch in types. If you have the following series of operations,

    Insert {a:1}
    Update {a:1} to {a:1, b:1}
    Insert {a:2}
    Remove {b:1}
    Insert {a:3}

This will result in the driver issuing 5 write commands to the server:

    Insert Command with {a:1}
    Update Command {a:1} to {a:1, b:1}
    Insert Command with {a:2}
    Remove Command with {b:1}
    Insert Command with {a:3}

If instead you order your operations as follows,

    Insert {a:1}
    Insert {a:2}
    Insert {a:3}
    Update {a:1} to {a:1, b:1}
    Remove {b:1}

The write commands issued by the driver will be,

    Insert Command with {a:1}, {a:2}, {a:3}
    Update Command {a:1} to {a:1, b:1}
    Remove Command with {b:1}

Allowing for a more efficient and faster bulk write operation.

For *unordered* bulk operations this is not important as the driver sorts operations by type and executes them in parallel.

This covers write operations for MongoDB. Let's look at querying for documents next.

## Read Methods
The main methods for querying the database are *find* and *aggregate*. In this CRUD tutorial we will focus on *find*.

The *find* method returns a cursor that allows us to operate on the data. The *cursor* also implements the Node.js 0.10.x or higher stream interface, allowing us to pipe the results to other streams.

Let's look at a simple *find* example that materializes all the documents from a query using the *toArray* method but limits the number of returned results to 2 documents.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Get the collection
    const col = db.collection('find');

    // Insert multiple documents
    const r = await col.insertMany([{a:1}, {a:1}, {a:1}]);
    assert.equal(3, r.insertedCount);

    // Get first two documents that match the query
    const docs = await col.find({a:1}).limit(2).toArray();
    assert.equal(2, docs.length);
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

Next let's take a look at the *next* method and how we can iterate over the cursor in ECMAScript 6. The new `async`/`await` commands allow for what is arguably a much cleaner and easier to read iteration code.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Get the collection
    const col = db.collection('find');

    // Insert multiple documents
    const r = await col.insertMany([{a:1}, {a:1}, {a:1}]);
    assert.equal(3, r.insertedCount);

    // Get the cursor
    const cursor = col.find({a:1}).limit(2);

    // Iterate over the cursor
    while(await cursor.hasNext()) {
      const doc = await cursor.next();
      console.dir(doc);
    }
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

## Executing Commands
The `Db.command` method also returns a `Promise` allowing us to leverage `async`/`await` for clear and concise code. Below is an example calling the `buildInfo` method.

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const url = 'mongodb://localhost:27017';
const dbName = 'myproject';

(async function() {
  let client;

  try {
    client = await MongoClient.connect(url);
    console.log("Connected correctly to server");

    const db = client.db(dbName);

    // Use the admin database for the operation
    const adminDb = db.admin();

    // Retrive the build information using the admin command
    await adminDb.command({buildInfo:1})
  } catch (err) {
    console.log(err.stack);
  }

  // Close connection
  if(client){
    client.close();  
  }
})();
```

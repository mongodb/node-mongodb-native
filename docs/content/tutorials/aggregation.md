---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
next: /tutorials/streams
prev: /tutorials/crud_operations
title: Aggregation
weight: 5
---
# Using the Aggregation Framework
The aggregation framework lets you transform and apply grouping, summations and other operations on the documents before they are returned to the application. It's a very powerful unix pipe like framework. In this tutorial we will explore the **aggregate** method on the *Collection* class and see how it can be used to return a cursor we can iterate over. This cursor also implements the Node.js 0.10.x stream interface which we will not cover in this tutorial. For more information about streams and the Node.js driver please look in the [Streams Tutorial](/tutorials/streams).

Let's start with a simple example that returns a cursor to iterate over the results from a simple *$match* and *$sum*.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('aggregate');
  // Insert a single document
  col.insert([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Get first two documents that match the query
    col.aggregate([
          {$match: {}}
        , {$group:
            {_id: '$a', total: {$sum: '$a'} }
          }
      ]).toArray(function(err, docs) {
      assert.equal(null, err);
      assert.equal(3, docs[0].total);
      db.close();
    });
  });
});
```

When executing the *aggregate* method as a cursor it's important to understand that on MongoDB 2.6 or higher this will use the native cursor support for the aggregation framework on the server. If the server is 2.4 or earlier it will emulate the cursor behavior with a virtual cursor. If a callback is included in the *aggregate* command it will fall back to the legacy mode that returns the first 16MB of results.

The cursor returned by the *aggregate* command has the same available method as the *find* cursor, namely the *toArray*, *next* and *each* methods.

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

  var col = db.collection('aggregate');
  // Insert a single document
  col.insert([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Get first two documents that match the query
    col.aggregate([
          {$match: {}}
        , {$group:
            {_id: '$a', total: {$sum: '$a'} }
          }
      ]).next(function(err, doc) {
      assert.equal(null, err);
      assert.equal(3, doc.total);
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

  var col = db.collection('aggregate');
  // Insert a single document
  col.insert([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Get first two documents that match the query
    col.aggregate([
          {$match: {}}
        , {$group:
            {_id: '$a', total: {$sum: '$a'} }
          }
      ]).each(function(err, doc) {
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

This covers the *aggregation* support in the Node.js MongoDB driver.
---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: tutorials
next: /tutorials/gridfs
prev: /tutorials/aggregation
title: Streams
weight: 6
---
# Streams Support in the Node.js Driver
The MongoDB driver has extensive Stream support for cursors as well as for GridFS. In essence the following aspects of the driver supports Node 0.10.x or higher style streams.

* `find` The cursor returned from the *find* method is a *Readable* stream.
* `aggregate` The cursor returned from the *aggregate* is a *Readable* stream.
* `parallelCollectionScan` Returns an array of one or more cursors that all are *Readable* streams.
* `GridStore.prototype.stream` Returns a stream that implements *Duplex* allowing for writing data in *w* mode and reading data in *r* mode.

We will look at a simple example for supported stream starting with the *find* command.

## Find Cursor as a Stream
Let's examine a simple query using *find* and how to use it as a node.js stream.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('streams');
  // Insert a single document
  col.insert([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Get the results using a find stream
    var cursor = col.find({});
    cursor.on('data', function(doc) {
      console.dir(doc);
    });

    cursor.once('end', function() {
      db.close();
    });
  });
});
```

A very simple and straight forward stream of documents. For each document the cursor will emit the *data* event and when the cursor has been exhausted it will issue the *end* event. To transform the data you can pipe the data from this stream into another stream. We will not show that here but there are a wide variety of stream based libraries available on [NPM](http://npmjs.org).

The stream is in object mode meaning it will emit the actual document instances. If you for some reason need this to be a different output you can use the `stream` function on the cursor to supply a transformation method that will be called for each document before it's emitted. Let's take a look at a simple example that uses *JSON.stringify* to convert each document to it's JSON string representation.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('streams');
  // Insert a single document
  col.insert([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Get the results using a find stream
    var cursor = col.find({}).stream({
      transform: function(doc) { 
        return JSON.stringify(doc);
      }
    });

    cursor.on('data', function(doc) {
      console.log(doc);
    });

    cursor.once('end', function() {
      db.close();
    });
  });
});
```

That wraps up the behaviors of the *Readable* stream for the *find* method. Next let's look at the aggregate command.

## Aggregation Cursor as a Stream
The aggregation cursor behaves very much like the *find* cursor. It's main difference is that it does not support a *transform* method. Let's have a look at a simple example.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  var col = db.collection('streams');
  // Insert a single document
  col.insert([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Get the results using a find stream
    var cursor = col.aggregate([${match: {}}]);
    cursor.on('data', function(doc) {
      console.log(doc);
    });

    cursor.once('end', function() {
      db.close();
    });
  });
});
```

As one can see the cursor behaves in the exact same way as the cursor that is returned when invoking the *find* method. Let's have a look at the *parallelCollectionScan* method that is a bit of a special case as it returns one or more cursors.

## The parallelCollectionScan method
The *parallelCollectionScan* method is a specialized method that allows for parallel reading of a collection using multiple cursors. This method is only available when connecting to a single server or replicaset topology. Let's look at an example.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  var docs = [];
  // Insert some documents
  for(var i = 0; i < 1000; i++) docs.push({a:i});
  // Get the collection
  var col = db.collection('parallelCollectionScan');
  // Insert 1000 documents in a batch
  coll.insert(docs, function(err, result) {
    var results = [];
    // Execute parallelCollectionScan command
    col.parallelCollectionScan({
      numCursors:3
    }, function(err, cursors) {
      assert.equal(null, err);
      assert.ok(cursors != null);
      assert.ok(cursors.length > 0);

      for(var i = 0; i < cursors.length; i++) {
        // Documents from the cursor
        cursors[i].on('data', function(doc) {
          results.push(doc);
        });

        // The end signal for each cursor
        cursors[i].once('end', function() {
          numCursors = numCursors - 1;
          // No more cursors let's ensure we got all results
          if(numCursors == 0) {
            assert.equal(docs.length, results.length);
            db.close();
          }
        });
      }
    });
  });
});
```

In this example we use each cursor as a stream and when all cursors have emitted the *end* event we check that the number of inserted documents match the number of emitted documents. Each cursor returned from the *parallelCollectionScan* method is functionally equivalent to the cursors returned from the the *find* method.

# GridStore the Read/Write Stream
Until now all the methods we have covered are *Readable* meaning they can only provide a readable stream. GridStore implements the *Duplex* stream meaning it can not only be read as a Stream (say stream a mp3 straight from your GridFS collections) but also be written to (say upload a file directly via http into GridFS). Let's look at the simple example of streaming a GridStore file and then one where we use an incoming stream to write to GridFS.

## Streaming a GridFS file to disk
Streaming a GridStore file to disk is fairly simple. The example below reads in a pdf file and saves it in GridFS. It then creates a GridStore instance pointing to the newly saved pdf file and passes the stream to a file write stream using pipe.

```js
var MongoClient = require('mongodb').MongoClient
  , GridStore = require('mongoddb').GridStore
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  // Set up gridStore
  var gs = new GridStore(db, 'manual.pdf', 'w');
  var filename = './test/functional/data/manual.pdf';
  var outputFilename = './test/functional/data/manual_out.pdf';
  // Write the a file to it (put your own here)
  gs.writeFile(filename, function(err, result) {   
    // Open a readable gridStore
    gs = new GridStore(db, 'manual.pdf', 'r');    
    
    // Create a file write stream
    var fileStream = fs.createWriteStream(outputFilename);
    fileStream.on('close', function(err) {     
      // Read the temp file and compare
      var compareData = fs.readFileSync(outputFilename);
      var originalData = fs.readFileSync(filename);
      // Validate that the data is the same
      assert.deepEqual(originalData, compareData);      
      db.close();
    })
    
    // Pipe out the data to disk
    var pipeResult = gs.stream().pipe(fileStream);
  });
});
```

## Streaming a File into GridFS
In the case of writing a file to GridFS using streams we do the reverse piping the file read stream into a our gridstore instance.

```js
var MongoClient = require('mongodb').MongoClient
  , GridStore = require('mongoddb').GridStore
  , ObjectID = require('mongoddb').ObjectID;
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  // Set up gridStore
  var stream = new GridStore(db, 'manual.pdf', 'w').stream();
  // File we want to write to GridFS
  var filename = './test/functional/data/manual.pdf';
  // Create a file reader stream to an object
  var fileStream = fs.createReadStream(filename);
  // Finish up once the file has been all read
  stream.on("end", function(err) {
    // Just read the content and compare to the raw binary
    GridStore.read(client, "test_stream_write", function(err, gridData) {
      var fileData = fs.readFileSync(filename);
      assert.equal(fileData.toString('hex'), gridData.toString('hex'));
      client.close();
    })
  });

  // Pipe it through to the gridStore
  fileStream.pipe(stream);
});
```

This concludes the support for Node.js 0.10.x streams in the MongoDB driver.
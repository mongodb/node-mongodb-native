# Mongo Driver and Mongo DB 2.6 Features

MongoDB 2.6 introduces some new powerful features that are reflected in the 1.4 driver release. These include.

* Aggregation cursors
* Per query timeouts **maxTimeMS**
* Ordered and Unordered bulk operations
* A parallelCollectionScan command for fast reading of an entire collection
* Integrated text search in the query language

Moreover the driver includes a whole slew of minor and major bug fixes and features. Some of the more noteworthy features include.

* Better support for domains in node.js
* Reconnect events for replicaset and mongos connections
* Replicaset emits "joined" and "left" events when new server join or leave the set
* Added **bufferMaxEntries** entry to allow tuning on how long driver keeps waiting for servers to come back up (default is until memory exhaustion)
* Upgraded BSON parser to rely on 0.2.6 returning to using **nan** package

Let's look at the main things in 2.6 features one by one.

## Aggregation cursors

The addition off aggregation cursors to MongoDB 2.6 now means that applications can disregard the previous max result limit of 16MB. Let's look at a simple use of the aggregation cursor.

		var MongoClient = require('mongodb').MongoClient;
		 
		MongoClient.connect("mongodb://localhost:27017/test", function(err, db) {
			// Get an aggregation cursor
			var cursor = db.collection('data').aggregate([
					{$match: {}}
				], {
		        allowDiskUse: true
		      , cursor: {batchSize: 1000}		
				});

			// Use cursor as stream
			cursor.on('data', function(data) {
				console.dir(data);
			});

			cursor.on('end', function() {
				db.close();
			});
		});

As one can see the cursor implements the **Readable** stream interface for 0.10.X or higher. For 2.4 the driver will emulate the cursor behavior by wrapping the result document.

## maxTimeMS

One feature that has requested often is the ability to timeout individual queries. In MongoDB 2.6 it's finally arrived and is known as the **maxTimeMS** option. Let's take a look at a simple usage of the property with a query.

		var MongoClient = require('mongodb').MongoClient;
		 
		MongoClient.connect("mongodb://localhost:27017/test", function(err, db) {
			// Get an aggregation cursor
			var cursor = db.collection('data')
				.find("$where": "sleep(1000) || true")
				.maxTimeMS(50);

			// Get alll the items
			cursor.toArray(function(err, items) {
				console.dir(err);
				console.dir(items);
				db.close();
			});
		});

This is a bit of a contrived example using sleep to force the query to wait a second. With the **maxTimeMS** set to 50 milliseconds the query will be aborted before the full second is up.

## Ordered/Unordered bulk operations

Under the covers MongoDB is moving away from the combination of a write operation + get last error (GLE) and towards a write commands api. These new commands allow for the execution of bulk insert/update/remove operations. The bulk api's are abstractions on top of this that server to make it easy to build bulk operations. Bulk operations come in two main flavors.

1. Ordered bulk operations. These operations execute all the operation in order and error out on the first write error.
2. Unordered bulk operations. These operations execute all the operations in parallel and aggregates up all the errors. Unordered bulk operations do not guarantee order of execution.

Let's look at two simple examples using ordered and unordered operations.

		var MongoClient = require('mongodb').MongoClient;
		 
		MongoClient.connect("mongodb://localhost:27017/test", function(err, db) {
		  // Get the collection
		  var col = db.collection('batch_write_ordered_ops');
		  // Initialize the Ordered Batch
		  var batch = col.initializeOrderedBulkOp();

		  // Add some operations to be executed in order
		  batch.insert({a:1});
		  batch.find({a:1}).updateOne({$set: {b:1}});
		  batch.find({a:2}).upsert().updateOne({$set: {b:2}});
		  batch.insert({a:3});
		  batch.find({a:3}).remove({a:3});

		  // Execute the operations
		  batch.execute(function(err, result) {
		  	console.dir(err);
		  	console.dir(result);  	
		  	db.close();
		  });
		});

		MongoClient.connect("mongodb://localhost:27017/test", function(err, db) {
		  // Get the collection
		  var col = db.collection('batch_write_ordered_ops');
		  // Initialize the Ordered Batch
		  var batch = col.initializeUnorderedBulkOp();

		  // Add some operations to be executed in order
		  batch.insert({a:1});
		  batch.find({a:1}).updateOne({$set: {b:1}});
		  batch.find({a:2}).upsert().updateOne({$set: {b:2}});
		  batch.insert({a:3});
		  batch.find({a:3}).remove({a:3});

		  // Execute the operations
		  batch.execute(function(err, result) {
		  	console.dir(err);
		  	console.dir(result);  	
		  	db.close();
		  });
		});

For older servers than 2.6 the API will downconvert the operations. However it's not possible to downconvert 100% so there might be slight edge cases where it cannot correctly report the right numbers.

## parallelCollectionScan

The **parallelCollectionScan** command is a special command targeted at reading out an entire collection using **numCursors** parallel cursors.

		var MongoClient = require('mongodb').MongoClient;
		 
		MongoClient.connect("mongodb://localhost:27017/test", function(err, db) {
			// Get an aggregation cursor
			db.collection('data').parallelCollectionScan({numCursors:3}, function(err, cursors) {
		    var results = [];

		    for(var i = 0; i < cursors.length; i++) {
		      cursors[i].get(function(err, items) {
		        test.equal(err, null);

		        // Add docs to results array
		        results = results.concat(items);
		        numCursors = numCursors - 1;

		        // No more cursors let's ensure we got all results
		        if(numCursors == 0) {
		          test.equal(docs.length, results.length);

		          db.close();
		          test.done();
		        }
		      });
		    }
			});
		});

This optimizes the IO throughput from a collection.

## Integrated text search in the query language

Text indexes are now integrated into the main query language and enabled by default. A simple example.

		var MongoClient = require('mongodb').MongoClient;
		 
		MongoClient.connect("mongodb://localhost:27017/test", function(err, db) {
		  // Get the collection
		  var collection = db.collection('textSearchWithSort');
		  collection.ensureIndex({s: 'text'}, function(err, result) {
		    test.equal(null, err);

		    collection.insert([
		        {s: 'spam'}
		      , {s: 'spam eggs and spam'}
		      , {s: 'sausage and eggs'}], function(err, result) {
		        test.equal(null, err);

		        collection.find(
		            {$text: {$search: 'spam'}}
		          , {fields: {_id: false, s: true, score: {$meta: 'textScore'}}}
		        ).sort({score: {$meta: 'textScore'}}).toArray(function(err, items) {
		          test.equal(null, err);
		          test.equal("spam eggs and spam", items[0].s);
		          db.close();
		          test.done();
		        });
		      });
		  });      
		});

## Emitting Reconnect and Joined/Left events

The Replicaset and Mongos now emits events for servers joining and leaving the replicaset. This let's applications more easily monitor the changes in the driver over time. **Reconnect** in the context of a Replicaset or Mongos means that the driver is starting to replay buffered operations.

		var MongoClient = require('mongodb').MongoClient;
		 
		MongoClient.connect("mongodb://localhost:27017,localhost:27027/test", function(err, db) {
			db.serverConfig.on('joined', function(err, server) {
				console.log("server joined");
				console.dir(server);
			});

			db.serverConfig.on('left', function(err, server) {
				console.log("server left");
				console.dir(server);
			});

			db.serverConfig.on('reconnect', function() {
				console.log("server reconnected");
			});	
		});

## bufferMaxEntries

Buffered Max Entries allow for more fine grained control on how many operations that will be buffered before the driver errors out and stops attempting to reconnect.

		var MongoClient = require('mongodb').MongoClient;
		 
		MongoClient.connect("mongodb://localhost:27017/test", {
				db: {bufferMaxEntries:0},
			}, function(err, db) {
				db.close();
		});

This example disables the command buffering completely and errors out the moment there is no connection available. The default value (for backward compatibility) is to buffer until memory runs out. Be aware that by setting a very low value you can cause some problems in failover scenarios in Replicasets as it might take a little but of time before f.ex a new Primary is elected and steps up to accept writes. Setting **bufferMaxEntries** to 0 in this case will cause the driver to error out instead of falling over correctly.

## Fsync and journal Write Concerns note

MongoDB from version 2.6 and higher disallows the combination of **journal** and **fsync**. Combining them will cause an error while on 2.4 **fsync** was ignored when provided with **journal**. The following semantics apply.

* j: If true block until write operations have been committed to the journal. Cannot be used in combination with `fsync`. Prior to MongoDB 2.6 this option was ignored if the server was running without journaling. Starting with MongoDB 2.6 write operations will fail with an exception if this option is used when the server is running without journaling.
* fsync: If true and the server is running without journaling, blocks until the server has synced all data files to disk. If the server is running with journaling, this acts the same as the `j` option, blocking until write operations have been committed to the journal. Cannot be used in combination with `j`.
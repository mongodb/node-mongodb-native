+++
date = "2015-03-17T15:36:56Z"
title = "Quick Start"
[menu.main]
  identifier = "Quick Start"
  weight = 15
  pre = "<i class='fa fa-road'></i>"
+++

Quick Start
===========
This guide will show you how to set up a simple application using Node.js and MongoDB. Its scope is only how to set up the driver and perform the simple CRUD operations. For more in-depth coverage, see the [tutorials]({{< relref "reference/main.md" >}}).

Create the package.json file
----------------------------
First, create a directory where your application will live.

```
mkdir myproject
cd myproject
```

Enter the following command and answer the questions to create the initial structure for your new project:

```
npm init
```

Next, install the driver dependency.

```
npm install mongodb@2.2 --save
```

You should see **NPM** download a lot of files. Once it's done you'll find all the downloaded packages under the **node_modules** directory.

Start a MongoDB Server
---------------------------
For complete MongoDB installation instructions, see [the manual](https://docs.mongodb.org/manual/installation/).

1. Download the right MongoDB version from [MongoDB](https://www.mongodb.org/downloads)
2. Create a database directory (in this case under **/data**).
3. Install and start a ``mongod`` process.

```
mongod --dbpath=/data
```

You should see the **mongod** process start up and print some status information.

Connect to MongoDB
---------------------
Create a new **app.js** file and add the following code to try out some basic CRUD
operations using the MongoDB driver.

Add code to connect to the server and the database **myproject**:

```js
{{% basic-connection %}}
```

Run your app from the command line with:

```
node app.js
```

The application should print **Connected successfully to server** to the console.

Insert a Document
--------------------
Add to **app.js** the following function which uses the **insertMany**
method to add three documents to the **documents** collection.  

```js
var insertDocuments = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Insert some documents
  collection.insertMany([
    {a : 1}, {a : 2}, {a : 3}
  ], function(err, result) {
    assert.equal(err, null);
    assert.equal(3, result.result.n);
    assert.equal(3, result.ops.length);
    console.log("Inserted 3 documents into the collection");
    callback(result);
  });
}
```

The **insert** command returns an object with the following fields:

* **result** Contains the result document from MongoDB
* **ops** Contains the documents inserted with added **_id** fields
* **connection** Contains the connection used to perform the insert

Add the following code to call the **insertDocuments** function:

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  insertDocuments(db, function() {
    db.close();
  });
});
```

Run the updated **app.js** file:

```
node app.js
```

The operation returns the following output:

```
Connected successfully to server
Inserted 3 documents into the collection
```

Find All Documents
------------------
Add a query that returns all the documents.

```js
var findDocuments = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Find some documents
  collection.find({}).toArray(function(err, docs) {
    assert.equal(err, null);
    console.log("Found the following records");
    console.log(docs)
    callback(docs);
  });
}
```
<!---
Changed console.dir to console.log, since most users will be running these examples from the command line
rather than from within a browser console, and console.log returns better formatting.
-->


This query returns all the documents in the **documents** collection. Add the **findDocument** method to the **MongoClient.connect** callback:

<!---
Removed the assert line for number of documents returned on the grounds that it's too brittle.
It's better if these code examples are idempotent, and if this one
is run repeatedly the number of documents in the collection will change.
-->

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  insertDocuments(db, function() {
    findDocuments(db, function() {
      db.close();
    });
  });
});
```

Find Documents with a Query Filter
----------------------------------

Add a query filter to find only documents which meet the query criteria.

```js
var findDocuments = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Find some documents
  collection.find({'a': 3}).toArray(function(err, docs) {
    assert.equal(err, null);
    console.log("Found the following records");
    console.log(docs);
    callback(docs);
  });      
}
```

Only the documents which match ``'a' : 3`` should be returned.

Update a document
-------------------
The following operation updates a document in the **documents** collection.

```js
var updateDocument = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Update document where a is 2, set b equal to 1
  collection.updateOne({ a : 2 }
    , { $set: { b : 1 } }, function(err, result) {
    assert.equal(err, null);
    assert.equal(1, result.result.n);
    console.log("Updated the document with the field a equal to 2");
    callback(result);
  });  
}
```

The method updates the first document where the field **a** is equal to **2** by adding a new field **b** to the document set to **1**. Next, update the callback function from **MongoClient.connect** to include the update method.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  insertDocuments(db, function() {
    updateDocument(db, function() {
      db.close();
    });
  });
});
```

Remove a document
-----------------
Remove the document where the field **a** is equal to **3**.

```js
var removeDocument = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Delete document where a is 3
  collection.deleteOne({ a : 3 }, function(err, result) {
    assert.equal(err, null);
    assert.equal(1, result.result.n);
    console.log("Removed the document with the field a equal to 3");
    callback(result);
  });    
}
```

Add the new method to the **MongoClient.connect** callback function.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  insertDocuments(db, function() {
    updateDocument(db, function() {
      removeDocument(db, function() {
        db.close();
      });
    });
  });
});
```

Index a Collection
------------------

[Indexes](https://docs.mongodb.org/manual/indexes/) can improve your application's
performance. The following function creates an index on the **a** field in the
**documents** collection.

```js
{{% index-collection %}}
```

Add the ``indexCollection`` method to your app:

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  insertDocuments(db, function() {
    indexCollection(db, function() {
      db.close();
    });
  });
});
```

For more detailed information, see the [tutorials]({{< relref "tutorials/main.md" >}}).

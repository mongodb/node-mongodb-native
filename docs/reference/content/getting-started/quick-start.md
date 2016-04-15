+++
date = "2015-03-17T15:36:56Z"
title = "Quick Start"
[menu.main]
  parent = "Getting Started"
  identifier = "Quick Tour"
  weight = 10
  pre = "<i class='fa'></i>"
+++

Quick Start
===========
This guide will show you how to set up a simple application using Node.js and MongoDB. Its scope is only how to set up the driver and perform the simple CRUD operations. For more in-depth coverage, see the [tutorials]({{< relref "reference/index.md" >}}).

Installing the Node.js driver using NPM
---------------------------------------

Be sure Node.js and NPM are correctly set up and included in your PATH. To install the driver:

```js
npm install mongodb
```

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
npm install mongodb --save
```

You should see **NPM** download a lot of files. Once it's done you'll find all the downloaded packages under the **node_modules** directory.

Booting up a MongoDB Server
---------------------------
Next, boot up a MongoDB server instance. Download the right MongoDB version from [MongoDB](https://www.mongodb.org/downloads), open a new shell or command line and ensure the **mongod** command is in the shell or command line path. Next create a database directory (in this case under **/data**).

```
mongod --dbpath=/data
```

You should see the **mongod** process start up and print some status information.

Connecting to MongoDB
---------------------
Next, create a new **app.js** file that you can use to try out some basic CRUD operations using the MongoDB driver.

Add code to connect to the server and the database **myproject**:

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected succesfully to server");

  db.close();
});
```

The application should print **Connected successfully to server** to the console.

Add some code to show the different CRUD operations available:

Inserting a Document
--------------------
Next, create a function to insert some documents.

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

Next, add a call the **insertDocuments** command to the **MongoClient.connect** method callback.

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

You should see the following output after running the **app.js** file.

```
Connected successfully to server
Inserted 3 documents into the collection
```

Updating a document
-------------------
Here's how to do a simple document update by adding a new field **b** to the document that has the field **a** set to **2**.

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
Next, remove the document where the field **a** is equal to **3**.

```js
var removeDocument = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Insert some documents
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

Find All Documents
------------------
Finally, add a query that returns all the documents.

```js
var findDocuments = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Find some documents
  collection.find({}).toArray(function(err, docs) {
    assert.equal(err, null);
    assert.equal(2, docs.length);
    console.log("Found the following records");
    console.dir(docs)
    callback(docs);
  });      
}
```

This query returns all the documents in the **documents** collection. One document was deleted earlier, so the total number
of documents returned is 2 **2**. Add the **findDocument** method to the **MongoClient.connect** callback:

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
    updateDocument(db, function() {
      removeDocument(db, function() {
        findDocuments(db, function() {
          db.close();
        });
      });
    });
  });
});
```

This concludes the Quick Start guide to basic CRUD functions. For more detailed information, see the 
[tutorials]({{< relref "reference/index.md" >}}) covering more specific topics of interest.

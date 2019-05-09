[![npm](https://nodei.co/npm/mongodb.png?downloads=true&downloadRank=true)](https://nodei.co/npm/mongodb/) [![npm](https://nodei.co/npm-dl/mongodb.png?months=6&height=3)](https://nodei.co/npm/mongodb/)

[![Build Status](https://secure.travis-ci.org/mongodb/node-mongodb-native.svg?branch=2.1)](http://travis-ci.org/mongodb/node-mongodb-native)
[![Coverage Status](https://coveralls.io/repos/github/mongodb/node-mongodb-native/badge.svg?branch=2.1)](https://coveralls.io/github/mongodb/node-mongodb-native?branch=2.1)
[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/mongodb/node-mongodb-native?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

# Description

The official [MongoDB](https://www.mongodb.com/) driver for Node.js. Provides a high-level API on top of [mongodb-core](https://www.npmjs.com/package/mongodb-core) that is meant for end users.

**NOTE: v3.x was recently released with breaking API changes. You can find a list of changes [here](CHANGES_3.0.0.md).**

## MongoDB Node.JS Driver

| what          | where                                          |
|---------------|------------------------------------------------|
| documentation | http://mongodb.github.io/node-mongodb-native  |
| api-doc        | http://mongodb.github.io/node-mongodb-native/3.1/api  |
| source        | https://github.com/mongodb/node-mongodb-native |
| mongodb       | http://www.mongodb.org                        |

### Bugs / Feature Requests

Think you’ve found a bug? Want to see a new feature in `node-mongodb-native`? Please open a
case in our issue management tool, JIRA:

- Create an account and login [jira.mongodb.org](https://jira.mongodb.org).
- Navigate to the NODE project [jira.mongodb.org/browse/NODE](https://jira.mongodb.org/browse/NODE).
- Click **Create Issue** - Please provide as much information as possible about the issue type and how to reproduce it.

Bug reports in JIRA for all driver projects (i.e. NODE, PYTHON, CSHARP, JAVA) and the
Core Server (i.e. SERVER) project are **public**.

### Support / Feedback

For issues with, questions about, or feedback for the Node.js driver, please look into our [support channels](http://www.mongodb.org/about/support). Please do not email any of the driver developers directly with issues or questions - you're more likely to get an answer on the [mongodb-user](http://groups.google.com/group/mongodb-user>) list on Google Groups.

### Change Log

Change history can be found in [`HISTORY.md`](HISTORY.md).

### Compatibility

For version compatibility matrices, please refer to the following links:

 * [MongoDB](https://docs.mongodb.com/ecosystem/drivers/driver-compatibility-reference/#reference-compatibility-mongodb-node)
 * [NodeJS](https://docs.mongodb.com/ecosystem/drivers/driver-compatibility-reference/#reference-compatibility-language-node)

# Installation

The recommended way to get started using the Node.js 3.0 driver is by using the `npm` (Node Package Manager) to install the dependency in your project.

## MongoDB Driver

Given that you have created your own project using `npm init` we install the MongoDB driver and its dependencies by executing the following `npm` command.

```bash
npm install mongodb --save
```

This will download the MongoDB driver and add a dependency entry in your `package.json` file.

You can also use the [Yarn](https://yarnpkg.com/en) package manager.

## Troubleshooting

The MongoDB driver depends on several other packages. These are:

* [mongodb-core](https://github.com/mongodb-js/mongodb-core)
* [bson](https://github.com/mongodb/js-bson)
* [kerberos](https://github.com/mongodb-js/kerberos)
* [node-gyp](https://github.com/nodejs/node-gyp)

The `kerberos` package is a C++ extension that requires a build environment to be installed on your system. You must be able to build Node.js itself in order to compile and install the `kerberos` module. Furthermore, the `kerberos` module requires the MIT Kerberos package to correctly compile on UNIX operating systems. Consult your UNIX operation system package manager for what libraries to install.

**Windows already contains the SSPI API used for Kerberos authentication. However, you will need to install a full compiler tool chain using Visual Studio C++ to correctly install the Kerberos extension.**

### Diagnosing on UNIX

If you don’t have the build-essentials, this module won’t build. In the case of Linux, you will need gcc, g++, Node.js with all the headers and Python. The easiest way to figure out what’s missing is by trying to build the Kerberos project. You can do this by performing the following steps.

```bash
git clone https://github.com/mongodb-js/kerberos
cd kerberos
npm install
```

If all the steps complete, you have the right toolchain installed. If you get the error "node-gyp not found," you need to install `node-gyp` globally:

```bash
npm install -g node-gyp
```

If it correctly compiles and runs the tests you are golden. We can now try to install the `mongod` driver by performing the following command.

```bash
cd yourproject
npm install mongodb --save
```

If it still fails the next step is to examine the npm log. Rerun the command but in this case in verbose mode.

```bash
npm --loglevel verbose install mongodb
```

This will print out all the steps npm is performing while trying to install the module.

### Diagnosing on Windows

A compiler tool chain known to work for compiling `kerberos` on Windows is the following.

* Visual Studio C++ 2010 (do not use higher versions)
* Windows 7 64bit SDK
* Python 2.7 or higher

Open the Visual Studio command prompt. Ensure `node.exe` is in your path and install `node-gyp`.

```bash
npm install -g node-gyp
```

Next, you will have to build the project manually to test it. Clone the repo, install dependencies and rebuild:

```bash
git clone https://github.com/christkv/kerberos.git
cd kerberos
npm install
node-gyp rebuild
```

This should rebuild the driver successfully if you have everything set up correctly.

### Other possible issues

Your Python installation might be hosed making gyp break. Test your deployment environment first by trying to build Node.js itself on the server in question, as this should unearth any issues with broken packages (and there are a lot of broken packages out there).

Another tip is to ensure your user has write permission to wherever the Node.js modules are being installed.

## Quick Start

This guide will show you how to set up a simple application using Node.js and MongoDB. Its scope is only how to set up the driver and perform the simple CRUD operations. For more in-depth coverage, see the [tutorials](docs/reference/content/tutorials/main.md).

### Create the `package.json` file

First, create a directory where your application will live.

```bash
mkdir myproject
cd myproject
```

Enter the following command and answer the questions to create the initial structure for your new project:

```bash
npm init
```

Next, install the driver dependency.

```bash
npm install mongodb --save
```

You should see **NPM** download a lot of files. Once it's done you'll find all the downloaded packages under the **node_modules** directory.

### Start a MongoDB Server

For complete MongoDB installation instructions, see [the manual](https://docs.mongodb.org/manual/installation/).

1. Download the right MongoDB version from [MongoDB](https://www.mongodb.org/downloads)
2. Create a database directory (in this case under **/data**).
3. Install and start a ``mongod`` process.

```bash
mongod --dbpath=/data
```

You should see the **mongod** process start up and print some status information.

### Connect to MongoDB

Create a new **app.js** file and add the following code to try out some basic CRUD
operations using the MongoDB driver.

Add code to connect to the server and the database **myproject**:

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'myproject';

// Use connect method to connect to the server
MongoClient.connect(url, function(err, client) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  const db = client.db(dbName);

  client.close();
});
```

Run your app from the command line with:

```bash
node app.js
```

The application should print **Connected successfully to server** to the console.

### Insert a Document

Add to **app.js** the following function which uses the **insertMany**
method to add three documents to the **documents** collection.

```js
const insertDocuments = function(db, callback) {
  // Get the documents collection
  const collection = db.collection('documents');
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
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'myproject';

// Use connect method to connect to the server
MongoClient.connect(url, function(err, client) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  const db = client.db(dbName);

  insertDocuments(db, function() {
    client.close();
  });
});
```

Run the updated **app.js** file:

```bash
node app.js
```

The operation returns the following output:

```bash
Connected successfully to server
Inserted 3 documents into the collection
```

### Find All Documents

Add a query that returns all the documents.

```js
const findDocuments = function(db, callback) {
  // Get the documents collection
  const collection = db.collection('documents');
  // Find some documents
  collection.find({}).toArray(function(err, docs) {
    assert.equal(err, null);
    console.log("Found the following records");
    console.log(docs)
    callback(docs);
  });
}
```

This query returns all the documents in the **documents** collection. Add the **findDocument** method to the **MongoClient.connect** callback:

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'myproject';

// Use connect method to connect to the server
MongoClient.connect(url, function(err, client) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  const db = client.db(dbName);

  insertDocuments(db, function() {
    findDocuments(db, function() {
      client.close();
    });
  });
});
```

### Find Documents with a Query Filter

Add a query filter to find only documents which meet the query criteria.

```js
const findDocuments = function(db, callback) {
  // Get the documents collection
  const collection = db.collection('documents');
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

### Update a document

The following operation updates a document in the **documents** collection.

```js
const updateDocument = function(db, callback) {
  // Get the documents collection
  const collection = db.collection('documents');
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
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'myproject';

// Use connect method to connect to the server
MongoClient.connect(url, function(err, client) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  const db = client.db(dbName);

  insertDocuments(db, function() {
    updateDocument(db, function() {
      client.close();
    });
  });
});
```

### Remove a document

Remove the document where the field **a** is equal to **3**.

```js
const removeDocument = function(db, callback) {
  // Get the documents collection
  const collection = db.collection('documents');
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
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'myproject';

// Use connect method to connect to the server
MongoClient.connect(url, function(err, client) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  const db = client.db(dbName);

  insertDocuments(db, function() {
    updateDocument(db, function() {
      removeDocument(db, function() {
        client.close();
      });
    });
  });
});
```

### Index a Collection

[Indexes](https://docs.mongodb.org/manual/indexes/) can improve your application's
performance. The following function creates an index on the **a** field in the
**documents** collection.

```js
const indexCollection = function(db, callback) {
  db.collection('documents').createIndex(
    { "a": 1 },
      null,
      function(err, results) {
        console.log(results);
        callback();
    }
  );
};
```

Add the ``indexCollection`` method to your app:

```js
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

// Connection URL
const url = 'mongodb://localhost:27017';

const dbName = 'myproject';

// Use connect method to connect to the server
MongoClient.connect(url, function(err, client) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  const db = client.db(dbName);

  insertDocuments(db, function() {
    indexCollection(db, function() {
      client.close();
    });
  });
});
```

For more detailed information, see the [tutorials](docs/reference/content/tutorials/main.md).

## Next Steps

 * [MongoDB Documentation](http://mongodb.org)
 * [Read about Schemas](http://learnmongodbthehardway.com)
 * [Star us on GitHub](https://github.com/mongodb/node-mongodb-native)

## License

[Apache 2.0](LICENSE.md)

© 2009-2012 Christian Amor Kvalheim  
© 2012-present MongoDB [Contributors](CONTRIBUTORS.md)

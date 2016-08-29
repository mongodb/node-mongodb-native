+++
date = "2015-03-19T12:53:39-04:00"
title = "Upgrading to 2.x"
[menu.main]
  parent = "Upgrade Guide"
  identifier = "Upgrading to 2.x"
  weight = 40
  pre = "<i class='fa fa-wrench'></i>"
+++

# Migrating Your Application To 2.x

There are some key changes in the driver that you should be aware of before migrating your application from version 1.x to 2.x.
Some APIs are cleaned up, and some 1.x features have been deprecated.

## Design differences in 2.x

One major change is that the driver has been split into two pieces. There is a new `mongodb-core` that contains the
low-level MongoDB APIs while `mongodb` contains the high-level driver. `mongodb-core` is targeted to creators of libraries like [Mongoose](http://mongoosejs.com/) and other ODMs who do not need the abstractions available in the `mongodb` driver. The driver is
currently compatible with the 0.11.x Node.js branch, which includes support for Kerberos and MongoDB 3.0.

## Changes

Below are listed some driver changes which could impact your application.

### Node.js versions and Streams

The 2.0 driver drops support for 0.8.x style streams in favor of 0.10.x or higher style pull-based streams, which are
faster and more reliable. Backwards compatibility is available by using the `readable-stream` npm package (might cause
some behavior changes for the cursor streams).

All dependencies have now been updated to use the `nan` package. They will compile and work on 0.11.x or higher.

### Grid Object

The grid object has been removed, due to its limited GridStore capabilities.

### db Object

The db instance object has changed in several ways. The following methods have been removed:

* `db.dereference` due to db references being deprecated in the server.
* `db.cursorInfo` removed as it never worked reliably.
* `db.stats` removed as inconsistent.
* `db.collectionNames` removed as it's just a specialized version of the new `listCollections` helper.
* `db.collectionInfo` removed as it's not compatible with the new MongoDB 3.0 or higher alternative storage engines.

New method:

* `db.listCollections` to replace all other collection inquiry methods. It works with MongoDB 3.0 and higher and provide backwards compatibility for MongoDB 2.6 or lower.

### Collection Object

The collection instance object has also changed in several key respects. Most importantly, we now return the `mongodb-core` result objects directly, with all the associated information returned from the server, instead of the selective information returned in the 1.4.x version.

New methods:

* `collection.insertOne` insert a single document.
* `collection.insertMany` insert an array of documents.
* `collection.replaceOne` fully replace an existing document.
* `collection.updateOne` update a single document.
* `collection.updateMany` update multiple documents.
* `collection.deleteOne` delete a single document.
* `collection.deleteMany` delete multiple documents.
* `collection.findOneAndUpdate` use findAndModify to update a document.
* `collection.findOneAndDelete` use findAndModify to remove a specific document.
* `collection.findOneAndReplace` use findAndModify to replace a specific document.

The current `insert`, `update` and `remove` methods are marked for deprecation and will be removed in a future 3.0 driver. These three methods now return the full `mongodb-core` results, and their third return value has been removed to ensure fewer compatibility problems with orchestration libraries like `async`.

The insert methods are now capping at the `maxWriteBatchSize` passed back from MongoDB on the results from the `ismaster` command. For MongoDB 2.4 and lower this means a maximum of 1000 documents in each insert batch. Legacy insert mode has been deprecated in favor of proper emulation of current 2.6 or higher write commands.

Another important change is in how `collection.find` works. The idea is to chain commands instead of passing them into the `find` method. It still supports old behavior from 1.4 so no code should break, but the API documentation reflects the new, preferred way of using `find` to execute queries.

### GridStore

The GridStore object has changed in major ways, due to issues discovered by users related to parallel writing (using the previously available `w+` append mode). As a result, in 2.0 `w+` only allows for changes to the file metadata and does not allow for appending to a file, avoiding possible data corruption. The hope is to create a new GridStore spec in the future that allows for properly handling parallel writing to an existing file, but that will require changes for all drivers as well as the server.

### MongoClient

MongoClient now has only the class method `connect`. Construction of a new MongoClient using `Server`, `ReplSet` or `Mongos` has been removed, due to the confusion it caused by duplicating the way one can build a topology connection using `Db` in 1.4. `MongoClient.connect` is the recommended way to connect to a MongoDB topology.

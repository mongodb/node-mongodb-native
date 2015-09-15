+++
date = "2015-03-19T12:53:39-04:00"
title = "Upgrading to 2.0"
[menu.main]
  parent = "Whats New"
  identifier = "Upgrading to 2.0"
  weight = 40
  pre = "<i class='fa fa-wrench'></i>"
+++

# Migrating Your Application To 2.0

There are some key changes in the driver going from 1.X to 2.X that one needs to be aware off before changing your application to using the new 2.X versions. There has been some cleanup of API's and some deprecations of 1.X features.

## Design differences in 2.X

One of the main changes is that the driver has been split into two pieces. There is a new `mongodb-core` that contains the low level MongoDB API's while `mongodb` contains the high level driver. `mongodb-core` is targeted to creators of libraries like `Mongoose` and other ODM's who do not need the abstractions available in the `mongodb` driver. The driver is also as of the time of writing compatible with the 0.11.x node.js branch including Kerberos support as well as MongoDB 2.8.

## Changes

We will outline where changes have occurred that could break your existing application.

### Node.JS versions and Streams

The 2.0 driver drops support for 0.8.x style streams and moves to 0.10.x or higher style pull based streams making for more reliable and faster streams. Backwards compatibility is by using the `readable-stream` npm package that might cause some slight behavior changes for the cursor streams.

All dependencies have now been updated to use the `nan` package meaning they will compile and work on 0.11.x or higher.

### Grid Object

The grid object has been removed as it's not widely used and offers very limited GridStore capabilities.

### Db Object

The db instance object have had several changes made to it. We've removed the following methods.

* `db.dereference` due to db references being deprecated in the server.
* `db.cursorInfo` removed as it never worked reliably.
* `db.stats` removed as inconsistent.
* `db.collectionNames` removed as it's just a specialized version of the new `listCollections` helper.
* `db.collectionInfo` removed as it's not compatible with the new MongoDB 2.8 or higher alternative storage enginers.

Added the following method

* `db.listCollections` to replace all other collection inquiry method as it will do the correct thing for MongoDB 2.8 and higher as well as provide backwards compatibility for MongoDB 2.6 or lower.

### Collection Object

A collection instance has also had several changes made to it. Most importantly we now return the `mongodb-core` result objects directly with all the associated information returned from the server instead of the current selective information returned in the 1.4.x version.

We've added the following new methods

* `collection.insertOne` Insert a single document.
* `collection.insertMany` Insert an array of documents.
* `collection.replaceOne` Replace an existing document fully.
* `collection.updateOne` Update a single document.
* `collection.updateMany` Update multiple documents in one go.
* `collection.deleteOne` Delete a single document.
* `collection.deleteMany` Delete multiple documents in one go.
* `collection.findOneAndUpdate` Use findAndModify to update a document.
* `collection.findOneAndDelete` Use findAndModify to remove a specific document.
* `collection.findOneAndReplace` Use findAndModify to replace a specific document.

The current `insert`, `update` and `remove` methods are marked for deprecation and will be removed in a future 3.0 driver. These 3 methods now also return the full `mongodb-core` results and have had their third return value removed to ensure less compatibility problems with orchestration libraries like `async`.

The insert methods are now capping at the `maxWriteBatchSize` passed back from MongoDB on the results from the `ismaster` command. For MongoDB 2.4 or lower this means a max of 1000 documents in each insert batch. Legacy insert mode has been deprecated in favor of proper emulation of current 2.6 or higher write commands.

Another important change is in how `collection.find` works. The idea is to chain commands instead of passing them into the `find` method. It still supports existing behavior from 1.4 so no code should break but the API documentation reflects the new preferred way to use the find to execute queries.

### GridStore

The GridStore object has had some major changes due to issues discovered by users related to parallel writing using the previous available `w+` append mode. Thus `w+` in 2.0 only allows for changes to the file metadata and does not allow for appending to a file avoiding the possible data corruption. The hope is to create a new GridStore spec in the future that allows for proper handling parallel writing to an existing file but this requires changes for all drivers as well as the server.

### MongoClient

MongoClient now only has the class method `connect`. Constructing of a new MongoClient using `Server`, `ReplSet` or `Mongos` has been removed due to the confusion it caused in duplicating the way one can build a topology connection using `Db` in 1.4. `MongoClient.connect` is the recommended way to connect to a MongoDB topology.
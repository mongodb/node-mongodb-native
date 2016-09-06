+++
date = "2015-03-17T15:36:56Z"
title = "Create Indexes"
[menu.main]
  parent = "Tutorials"
  identifier = "Create Indexes"
  weight = 35
  pre = "<i class='fa'></i>"
+++

# Create Indexes

To create an index on a field or fields, pass an index specification
document to the `createIndex()` method:

```js

   { <field1>: <type1>, <field2>: <type2> ... }

```

## Create an Ascending Index

For an ascending index type, specify ``1`` for ``<type>``.

The following example creates an ascending index key for the
``dateOfBirth`` field:

```js

var createAscendingIndex = function(db, callback) {
  // Get the users collection
  var collection = db.collection('users');
  // Create the index
  collection.createIndex(
    { dateOfBirth : 1 }, function(err, result) {
    console.log(result);
    callback(result);
  });
};

```

## Create a Descending Index

For an ascending index type, specify ``-1`` for ``<type>``.

The following example specifies a descending index key on the
``lastName`` field:

```js
var createDescendingIndex = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('users');
  // Create the index
  collection.createIndex(
    { lastName : -1 }, function(err, result) {
    console.log(result);
    callback(result);
  });
};

```

## Create a Compound Index


To specify a compound index, use the ``compoundIndex`` method.

The following example specifies a compound index key composed of the
``lastName`` field sorted in descending order, followed by the
``dateOfBirth`` field sorted in ascending order:

```js
var createCompoundIndex = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('users');
  // Create the index
  collection.createIndex(
    { lastName : -1, dateOfBirth : 1 }, function(err, result) {
    console.log(result);
    callback(result);
  });
};
```

## Create a Text Index


MongoDB also provides
[text](https://docs.mongodb.org/manual/core/index-text/) indexes to
support text search of string content. Text indexes can include any
field whose value is a string or an array of string elements.

This example specifies a text index key for the ``content`` field:

```js
{{% create-text-index %}}
```

## Create a Hashed Index

To specify a [hashed](https://docs.mongodb.org/manual/core/index-hashed/) index key,
use the ``hashed`` method.

This example specifies a hashed index key for the ``timestamp`` field:

```js
var createHashedIndex = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('users');
  // Create the index
  collection.createIndex(
    { timestamp : "hashed" }, function(err, result) {
    console.log(result);
    callback(result);
  });
};
```

## Create Geospatial Indexes


There are also helpers for creating the index keys for the various
geospatial indexes supported by mongodb.

### Create a `2dsphere` Index

To specify a [2dsphere](https://docs.mongodb.org/manual/core/2dsphere/)
index key, use one of the ``geo2dsphere`` methods.

This example specifies a 2dsphere index on the ``location`` field:

```js
{{% create-2dsphere-index %}}
```

### Create a `2d` Index

To specify a [2d](https://docs.mongodb.org/manual/core/2d/) index key, use the ``geo2d``
method.

.. important::

   A 2d index is for data stored as points on a two-dimensional plane
   and is intended for legacy coordinate pairs used in MongoDB 2.2 and
   earlier.

This example specifies a 2d index on the ``points`` field:

```js
var create2dIndex = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('users');
  // Create the index
  collection.createIndex(
    { points : "2d" }, function(err, result) {
    console.log(result);
    callback(result);
  });
};
```

## IndexOptions

In addition to the index specification document, `createIndex`
method can take an index options document, such as to create unique
indexes or partial indexes.

### Create a Unique Index


```js
var createUniqueIndex = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('users');
  // Create the index
  collection.createIndex(
    { lastName : -1, dateOfBirth : 1 },
    { unique:true },
    function(err, result) {
      console.log(result);
      callback(result);
  });
};
```

### Create a Partial Index


```js

var createPartialIndex = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('users');
  // Create the index
  collection.createIndex(
    { lastName : 1, firstName: 1 },
    { partialFilterExpression: { points: { $gt: 5 } } },
    function(err, result) {
       console.log(result);
       callback(result);
  });
};
```

For other index options, see [Index Options](https://docs.mongodb.org/manual/core/index-properties/).

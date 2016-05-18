+++
date = "2016-06-01T12:53:30-04:00"
title = "Projections"
[menu.main]
  parent = "Tutorials"
  identifier = "Projections"
  weight = 30
  pre = "<i class='fa'></i>"
+++

# Projections

By default, queries in MongoDB return all fields in matching
documents. To limit the amount of data that MongoDB sends to
applications, you can include a projection document in the query
operation.

## Projection Document

The projection document limits the fields to return for all
matching documents. The projection document can specify the
inclusion of fields or the exclusion of field and has the
following form:

```js
{ field1: <value>, field2: <value> ... }
```

``<value>`` may be ``0`` (or ``false``) to exclude the field, or
``1`` (or ``true``) to include it. With the exception of the ``_id``
field, you may not have both inclusions and exclusions in the same
projection document.

## Examples

The following code example uses the ``restaurants`` sample dataset.

To return only the ``name``, ``cuisine`` and ``_id`` fields for documents
which match the query filter, explicitly include the ``name`` and
``cuisine`` fields in the projection document. The ``_id`` field is
included automatically unless specifically excluded.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/test';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");

  findDocuments(db, function() {
    db.close();
  });  
});


var findDocuments = function(db, callback) {
  // Get the documents collection
  var collection = db.collection( 'restaurants' );
  // Find some documents
  collection.find({ 'cuisine' : 'Brazilian' }, { 'name' : 1, 'cuisine' : 1 }).toArray(function(err, docs) {
    assert.equal(err, null);
    console.log("Found the following records");
    console.log(docs)
    callback(docs);
  });
}
```

To return ``name`` and ``cuisine`` but exclude all other fields,
including ``_id``, use the following projection document:

```js
{ 'name' : 1, 'cuisine' : 1, '_id': 0 }
```

To return all fields *except* the address field, use the following:

```js
{ 'address' : 0 }
```


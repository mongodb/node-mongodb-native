+++
date = "2015-03-19T14:27:51-04:00"
title = "Text Search"
[menu.main]
  parent = "Tutorials"
  identifier = "Text Search"
  weight = 40
  pre = "<i class='fa'></i>"
+++

# Text Search

Use the [$text](https://docs.mongodb.org/manual/reference/operator/query/text/)
operator to perform text searches on fields which have a
[text index](https://docs.mongodb.org/manual/core/index-text/).

To create a text index on a collection, pass a document containing
the name of the field to be indexed with the value 'text' to the
``createIndex()`` method.

```js
var createTextIndex = function(db, callback) {
  // Get the restaurants collection
  var collection = db.collection('restaurants');
  // Create the index
  collection.createIndex(
    { name : "text" }, function(err, result) {
    console.log(result);
    callback(result);
  });
};

// use the createTextIndex function
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = 'mongodb://localhost:27017/test';
// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to server");
  createTextIndex(db, function() {
    db.close();
  });
});
```


The following example assumes that a database called ``test`` has a
collection called ``restaurants``, with a text index on the ``name`` field.
A [sample dataset](https://docs.mongodb.org/getting-started/node/import-data/)
is available for download.

```js
var findDocuments = function(db, callback) {
  // Get the documents collection
  var collection = db.collection('restaurants');
  // Find some documents
  collection.find({ '$text': {'$search' : 'Garden' } } ).toArray(function(err, docs) {
    assert.equal(err, null);
    console.log("Found the following records");
    console.log(docs);
    callback(docs);
  });      
}

// use the findDocuments() function
{{% find-documents %}}
```
For more information about the ``$text`` operator and its options, see the
[manual entry](https://docs.mongodb.org/manual/reference/operator/query/text/).

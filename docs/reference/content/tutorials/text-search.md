+++
date = "2015-03-19T14:27:51-04:00"
title = "Text Search"
[menu.main]
  parent = "Tutorials"
  identifier = "Text Search"
  weight = 50
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
function createTextIndex(db, callback) {
  // Get the restaurants collection
  const collection = db.collection('restaurants');
  // Create the index
  collection.createIndex(
    { name : "text" }, function(err, result) {
    console.log(result);
    callback(result);
  });
};


{{% myproject-connect %}}
  createTextIndex(db, function() {
    client.close();
  });
});
```


The following example assumes that a database called ``test`` has a
collection called ``restaurants``, with a text index on the ``name`` field.
A [sample dataset](https://docs.mongodb.org/getting-started/node/import-data/)
is available for download.

```js
function findDocuments(db, callback) {
  // Get the documents collection
  const collection = db.collection('restaurants');
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

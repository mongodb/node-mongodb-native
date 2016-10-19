+++
date = "2015-03-19T12:53:30-04:00"
title = "Collations"
[menu.main]
  parent = "Tutorials"
  identifier = "Collations"
  weight = 30
  pre = "<i class='fa'></i>"
+++

# Overview

Collations provide a set of rules which comply with the conventions
of a particular language when comparing strings.

For example, in Canadian French, the last accent in a given word
determines the sorting order.

Consider the following French words:

```js
   cote < coté < côte < côté
```

The sort order using the Canadian French collation would result in
the following:

```js
   cote < côte < coté < côté
```

If collation is unspecified, MongoDB uses the simple binary comparison for
strings.  As such, the sort order of the words would be:

```js
cote < coté < côte < côté
```

# Usage

You can specify a default collation for collections and indexes when
they are created, or specify a collation for CRUD operations and
aggregations. For operations that support collation, MongoDB uses the
collection's default collation unless the operation specifies a
different collation.

## Collation Parameters

```xml
collation: {
   locale: <string>,
   caseLevel: <bool>,
   caseFirst: <string>,
   strength: <int>,
   numericOrdering: <bool>,
   alternate: <string>,
   maxVariable: <string>,
   backwards: <bool>
}
```

The only required parameter is ``locale``, which the server parses as
an [ICU format locale ID](http://userguide.icu-project.org/locale>).
For example, use ``en_US`` to represent US English and ``fr_CA`` to
represent Canadian French.

For a complete description of the available parameters, see the
[MongoDB manual entry](https://docs.mongodb.com/manual/)`.

<!-- NOTE placeholder link to Collation in the manual -->

## Assign a Default Collation to a Collection

The following example creates a new collection
called ``contacts`` on the ``test`` database and assigns a default
collation with the ``fr_CA`` locale. Specifying a collation when you
create the collection ensures that all queries that are run against the
``contacts`` collection use the ``fr_CA`` collation, unless the query
specifies another collation. Any indexes on the new collection also
inherit the default collation, unless the creation command specifies
another collation.

```js
{{% myproject-connect %}}

  createCollated(db, function() {
    db.close();
  });
});

var createCollated = function(db, callback) {
  db.createCollection("contacts", 
    { 
      'collation' : 
        { 'locale': 'fr_CA' }
    },

    function(err, results) {
      console.log("Collection created.");
      callback();
    }
  );
};
```

## Assign a Default Collation to an Index

To specify a collation for an index, use the ``collation``
option when you create the index.

The following example creates an index on the ``name``
field of the ``contacts`` collection, with the ``unique`` parameter
enabled and a default collation with ``locale`` set to ``en_US``.

```js
{{% myproject-connect %}}

  createCollatedIndex(db, function() {
    db.close();
  });
});

var createCollatedIndex = function(db, callback) {
  // Get the contacts collection
  var collection = db.collection('contacts');
  // Create the index
  collection.createIndex(
    { 'name' : 1 },
    { 'unique' : 1 },
    { 'collation' : { 'locale' : 'en_US' } }, function(err, result) {
      console.log(result);
      callback(result);
  });
};
```

To use this index, make sure your queries also specify the same
collation. The following query uses the above index:

```js
var findDocuments = function(db, callback) {
  var collection = db.collection( 'contacts' );
  collection.find({ 'city' : 'New York' }, { '_id' : 0 }, { 'collation' : {'locale' : 'en_US' }}).toArray(function(err, docs) {
      assert.equal(err, null);
      callback(docs);
  });
}
```

The following queries do **NOT** use the index. The first query uses no
collation, and the second uses a collation with a different ``strength``
value than the collation on the index.

```js
var findDocuments = function(db, callback) {
  var collection = db.collection( 'contacts' );
  collection.find({ 'city' : 'New York' }, { '_id' : 0 }).toArray(function(err, docs) {
      assert.equal(err, null);
      callback(docs);
  });
}

var findDocuments = function(db, callback) {
  var collection = db.collection( 'contacts' );
  collection.find({ 'city' : 'New York' }, { '_id' : 0 }, { 'collation' : { 'locale' : 'en_US' , 'strength' : 2 }}).toArray(function(err, docs) {
      assert.equal(err, null);
      callback(docs);
  });
}
```

## Operations that Support Collation

All reading, updating, and deleting methods support collation. Some
examples are listed below.

### ``find()`` and ``sort()``

Individual queries can specify a collation to use when matching
and sorting results. The following query and sort operation uses
a German collation with the ``locale`` parameter set to ``de``.

```js
{{% myproject-connect %}}

  findDocuments(db, function() {
    db.close();
  });
});

var findDocuments = function(db, callback) {
  var collection = db.collection( 'contacts' );
  collection.find({ 'city' : 'New York' }, { '_id' : 0 }, { 'collation' : {'locale' : 'de' } }).sort({ 'name': 1 }).toArray(function(err, docs) {
      assert.equal(err, null);
      console.log("Found the following records");
      console.log(docs)
      callback(docs);
  });
}
```

### ``findOneAndUpdate()``

A collection called ``names`` contains the following documents:

```js
{ "_id" : 1, "first_name" : "Hans" }
{ "_id" : 2, "first_name" : "Gunter" }
{ "_id" : 3, "first_name" : "Günter" }
{ "_id" : 4, "first_name" : "Jürgen" }
```

The following ``findOneAndUpdate`` operation on the collection
does not specify a collation.

```js
{{% myproject-connect %}}
  findAndUpdate(db, function() {
    db.close();
  });
});

var findAndUpdate = function(db, callback) {
  var collection = db.collection('names');
  collection.findOneAndUpdate({ first_name : { $lt: "Gunter" } }, { $set: { verified: true } }, function(err, result) {
    assert.equal(err, null);
    callback(result);
  });
}
```

Because ``Gunter`` is lexically first in the collection,
the above operation returns no results and updates no documents.

Consider the same ``find_one_and_update`` operation but with the
collation specified.  The locale is set to ``de@collation=phonebook``.

{{% note %}}
Some locales have a ``collation=phonebook`` option available for
use with languages which sort proper nouns differently from other
words. According to the ``de@collation=phonebook`` collation,
characters with umlauts come before the same characters without
umlauts.
{{% /note %}}

```js
{{% myproject-connect %}}
  findAndUpdate(db, function() {
    db.close();
  });
});

var findAndUpdate = function(db, callback) {
  var collection = db.collection('names');
  collection.findOneAndUpdate({ first_name : { $lt: "Gunter" } }, { $set: { verified: true } }, {collation : { locale : 'de@collation=phonebook' } }, function(err, result) {
    assert.equal(err, null);
    console.log(result);
    callback(result);
  });
}
```

The operation returns the following updated document:

```js
{ lastErrorObject: { updatedExisting: true, n: 1 },
  value: { _id: 3, first_name: 'Günter' },
  ok: 1 }
```

### ``findOneAndDelete()``

Set the ``numericOrdering`` collation parameter to ``true``
to sort numeric strings based on their numerical order instead of their
lexical order.

The collection ``numbers`` contains the following documents:

```js
{ "_id" : 1, "a" : "16" }
{ "_id" : 2, "a" : "84" }
{ "_id" : 3, "a" : "179" }
```

The following example matches the first document in which field ``a``
has a numeric value greater than 100 and deletes it.

```js
{{% myproject-connect %}}
  findAndDelete(db, function() {
    db.close();
  });
});

var findAndDelete = function(db, callback) {
  var collection = db.collection('numbers');
  collection.findOneAndDelete({ a : { $gt: "100" } }, {collation : { locale : 'en', numericOrdering: true } }, function(err, result) {
    assert.equal(err, null);
    console.log(result);
    callback(result);
  });
}
```

After the above operation, the following documents remain in the
collection:

```js
{ "_id" : 1, "a" : "16" }
{ "_id" : 2, "a" : "84" }
```

If you perform the same operation without collation, the server deletes
the first document it finds in which the lexical value of ``a`` is
greater than ``"100"``.

```js
{{% myproject-connect %}}
  findAndDelete(db, function() {
    db.close();
  });
});

var findAndDelete = function(db, callback) {
  var collection = db.collection('numbers');
  collection.findOneAndDelete({ a : { $gt: "100" } }, function(err, result) {
    assert.equal(err, null);
    console.log(result);
    callback(result);
  });
}
```

After the above operation, the following documents remain in the
collection:

```js
{ "_id" : 2, "a" : "84" }
{ "_id" : 3, "a" : "179" }
```

## Aggregation

To use collation with an aggregation operation, add the collation
document after the array of pipeline stages.

The following aggregation example uses a collection called ``names``
and groups the ``first_name`` field together, counts the total
number of results in each group, and sorts the
results by German phonebook order.

```js
{{% myproject-connect %}}
  countNames(db, function() {
    db.close();
  });
});

var countNames = function(db, callback) {
  var collection = db.collection( 'names' );
  collection.aggregate( 
      [ 
        { '$group': { '_id': "$first_name", 'nameCount': { '$sum': 1 } } },
        { '$sort' : { '_id' : 1 } }
      ], { collation : { locale : 'de@collation=phonebook' } },

      function(err, docs) {
        assert.equal(err, null);
        console.log("Found the following records");
        console.log(docs)
        callback(docs);
      }
  );
}
```

+++
date = "2015-03-18T21:14:20-04:00"
title = "Aggregation"
[menu.main]
  parent = "Tutorials"
  identifier = "Aggregation"
  weight = 38
  pre = "<i class='fa'></i>"
+++

# Aggregation

## Overview

Aggregation operations process data records and return
computed results. Aggregation operations group values from
multiple documents together, and can perform a variety of
operations on the grouped data to return a single result.

## The Aggregation Pipeline

The aggregation pipeline is a framework for data aggregation
modeled on the concept of data processing pipelines. Documents
enter a multi-stage pipeline that transforms the documents into
aggregated results.

For a full explanation and a complete list of pipeline stages
and operators, see the
[manual:](https://docs.mongodb.com/manual/core/aggregation-pipeline/)

The following example uses the aggregation pipeline on the
``restaurants`` sample dataset to find
a list of the total number of 5-star restaurants, grouped by restaurant
category.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');
var url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  simplePipeline(db, function() {
    db.close();
  });
});

var simplePipeline = function(db, callback) {
  var collection = db.collection( 'restaurants' );
  collection.aggregate( 
      [ { '$match': { "stars": 5 } },
        { '$unwind': '$categories'},
        { '$group': { '_id': "$categories", 'fiveStars': { '$sum': 1 } } }		
      ],	  
	  function(err, results) {
        assert.equal(err, null);

        console.log(results)
        callback(results);
      }
  );
}
```

Inside the ``aggregate`` method, the first pipeline stage filters out
all documents except those with ``5`` in the ``stars`` field. The
second stage unwinds the ``categories`` field, which is an array, and
treats each item in the array as a separate document. The third stage
groups the documents by category and adds up the number of matching
5-star results.

## Single Purpose Aggregation Operations

MongoDB provides helper methods for some aggregation functions,
including [``count``](https://docs.mongodb.com/manual/reference/command/count/), 
[``group``](https://docs.mongodb.com/manual/reference/command/group/), 
and [``distinct``](https://docs.mongodb.com/manual/reference/command/distinct/).

### Count

The following example demonstrates how to use the ``count`` method to
find the total number of documents which have the exact array
``[ 'Chinese', 'Seafood' ]`` in the ``categories`` field.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');
var url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  simpleCount(db, function() {
    db.close();
  });
});

var simpleCount = function(db, callback) {
  var collection = db.collection( 'restaurants' );
  collection.count({ 'categories': [ 'Chinese', 'Seafood' ] },	  
	  function(err, result) {
        assert.equal(err, null);
        console.log(result)
        callback(result);
      }
  );
}
```

### Group

The following example uses the ``group`` method with four
arguments: 

1. an array of fields to group by
2. a document with conditions for filterings
3. an initial results document
4. a reduce function

The example groups the results by number of stars where the ``categories``
array is ``['Peruvian']``.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');
var url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  simpleGroup(db, function() {
    db.close();
  });
});

var simpleGroup = function(db, callback) {
    var collection = db.collection( 'restaurants' );
    collection.group( ['stars'], 
                      { 'categories': ['Peruvian'] }, 
                      { 'total': 0 },
                      "function ( curr, result ) { result.total++ }",  
	  
      function(err, result) {
        assert.equal(err, null);
        console.log(result)
        callback(result);
      }
  );
}
```

### Distinct

The ``distinct`` helper method eliminates results which contain
values and returns one record for each unique value.

The following example returns a list of unique values for the
``categories`` field in the ``restaurants`` collection:

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');
var url = 'mongodb://localhost:27017/test';

MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  simpleDistinct(db, function() {
    db.close();
  });
});

var simpleDistinct = function(db, callback) {
	var collection = db.collection( 'restaurants' );
    collection.distinct( 'categories', 
	  
	  function(err, result) {
        assert.equal(err, null);
        console.log(result)
        callback(result);
      }
  );
}
```



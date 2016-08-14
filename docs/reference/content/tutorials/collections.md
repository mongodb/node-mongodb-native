+++
date = "2015-03-19T14:27:51-04:00"
title = "Collections"
[menu.main]
  parent = "Tutorials"
  identifier = "Collections"
  weight = 36
  pre = "<i class='fa'></i>"
+++

# Collections

MongoDB stores documents in collections. If a collection does not
exist, MongoDB creates the collection when you first store data for
that collection.

You can also explicitly create a collection with various options,
such as setting the maximum size or the documentation validation rules.

## Capped Collection

Capped collections have maximum size or document counts that prevent
them from growing beyond maximum thresholds. All capped collections must
specify a maximum size and may also specify a maximum document count.
MongoDB removes older documents if a collection reaches the maximum size
limit before it reaches the maximum document count.

To create a [capped collection](https://docs.mongodb.com/manual/core/capped-collections/),
use the ``createCollection`` method and specify ``'capped' : true``.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');
var url = 'mongodb://localhost:27017/test';
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  createCapped(db, function() {
    db.close();
  });
});

var createCapped = function(db, callback) {
  db.createCollection("myCollection", { "capped": true, "size": 100000, "max": 5000},
    function(err, results) {
      console.log("Collection created.");
      callback();
    }
  );
};
```

## Document Validation

Collections with [validation](https://docs.mongodb.com/manual/core/document-validation/)
compare each inserted or updated
document against the criteria specified in the validator option.
Depending on the ``validationLevel`` and ``validationAction``, MongoDB
either returns a warning, or refuses to insert or update the document
if it fails to meet the specified criteria.

The following example creates a ``contacts`` collection with a validator
that specifies that inserted or updated documents should match at
least one of three following conditions:

- the ``phone`` field is a string
- the ``email`` field matches the regular expression
- the ``status`` field is either ``Unknown`` or ``Incomplete``.

```js
var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');
var url = 'mongodb://localhost:27017/test';
MongoClient.connect(url, function(err, db) {
  assert.equal(null, err);
  createValidated(db, function() {
    db.close();
  });
});


var createValidated = function(db, callback) {
  db.createCollection("contacts", 
	   {
	      'validator': { '$or':
	         [
	            { 'phone': { '$type': "string" } },
	            { 'email': { '$regex': /@mongodb\.com$/ } },
	            { 'status': { '$in': [ "Unknown", "Incomplete" ] } }
	         ]
	      }
	   },	   
    function(err, results) {
      console.log("Collection created.");
      callback();
    }
  );
};
  
```



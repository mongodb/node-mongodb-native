Collections
===========

See also:

  * [Database](database.html)
  * [Queries](queries.html)
  
## Collection objects

Collection object is a pointer to a specific collection in the [database](database.html). If you want to [insert](insert.html) new records or
[query](queries.html) existing ones then you need to have a valid collection object. 

**NB** Collection names can't start or end with a period nor contain a dollar sign! (`.tes$t` is not allowed)

## Creating collections

Collections can be created with `createCollection`

```javascript
  db.createCollection([[name[, options]], callback)
```

where `name` is the name of the collection, options a set of configuration parameters and `callback` is a callback function. `db` is the database object. 

The first parameter for the callback is the error object (null if no error) and the second one is the pointer to the newly created collection. If strict mode is on and the table exists, the operation yields in error. With strict mode off (default) the function simple returns the pointer to the existing collection and does not truncate it.

```javascript
  db.createCollection("test", function(err, collection){
      collection.insert({"test":"value"});
  });
```

## Creating collections options
Several options can be passed to the `createCollection` function with `options` parameter.  

	* `raw` - driver returns documents as bson binary Buffer objects, `default:false`

### Collection properties

  * `collectionName` is the name of the collection (not including the database name as a prefix)
  * `db` is the pointer to the corresponding database object

Example of usage:

    console.log("Collection name: "+collection.collectionName)

## List existing collections

### List names

Collections can be listed with `collectionNames`

```javascript
  db.collectionNames(callback);
```
    
`callback` gets two parameters - an error object (if error occured) and an array of collection names as strings.

Collection names also include database name, so a collection named `posts` in a database `blog` will be listed as `blog.posts`.

Additionally there's system collections which should not be altered without knowing exactly what you are doing, these sollections can be identified with `system` prefix. For example `posts.system.indexes`.

Example:
    
```javascript
  var MongoClient = require('mongodb').MongoClient
    , format = require('util').format;    

  MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
    if(err) throw err;
    db.collectionNames(function(err, collections){
        console.log(collections);
    });
  });
```

## List collections

Collection objects can be listed with database method `collections`

```javascript
  db.collections(callback)
```

Where `callback` gets two parameters - an error object (if an error occured) and an array of collection objects.

## Selecting collections

Existing collections can be opened with `collection`

```javascript
  db.collection([[name[, options]], callback);
```

If strict mode is off, then a new collection is created if not already present.

## Selecting collections options
Several options can be passed to the `collection` function with `options` parameter.  

	* `raw` - driver returns documents as bson binary Buffer objects, `default:false`

## Renaming collections

A collection can be renamed with collection method `rename`

```javascript
  collection.rename(new_name, callback);
```

Passing the optional dropTarget boolean as the thrid parameter will allow overwritting of existing collections
    
```javascript
  collection.rename(new_name, {dropTarget:true}, callback);
```

## Removing records from collections

Records can be erased from a collection with `remove`

```javascript
  collection.remove([[query[, options]], callback]);
```
    
Where

  * `query` is the query that records to be removed need to match. If not set all records will be removed
  * `options` indicate advanced options.
  * `callback` callback function that gets two parameters - an error object (if an error occured) and the count of removed records
    
## Removing collections

A collection can be dropped with `drop`

```javascript
  collection.drop(callback);
```

or with `dropCollection`

```javascript
  db.dropCollection(collection_name, callback)
```

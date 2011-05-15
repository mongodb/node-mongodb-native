Collections
===========

See also:

  * [Database](database.md)
  * [Queries](queries.md)
  
## Collection objects

Collection obejct is a pointer to a specific collection in the [database](database.md). If you want to [insert](insert.md) new records or
[query](queries.md) existing ones then you need to have a valid collection object. 

## Creating collections

Collections can be created with `createCollection`

    db.createCollection(name, callback)

where `name` is the name of the collection and `callback` is a callback function. `db` is the database object. 

The first parameter for
the callback is the error object (null if no error) and the second one is the pointer to the newly created
collection. If strict mode is on and the table exists, the operation yields in error. With strict mode off (default)
the function simple returns the pointer to the existing collection and does not truncate it.

    db.createCollection("test", function(err, collection){
        collection.insert({"test":"value"});
    });

## List existing collections

Collections can be listed with `collectionNames`

    db.collectionNames(callback);
    
`callback` gets two parameters - an error object (if error occured) and an array of collection names as strings.

Collection names also include database name, so a collection named `posts` in a database `blog` will be listed as `blog.posts`.

Additionally there's system collections which should not be altered without knowing exactly what you are doing, these sollections
can be identified with `system` prefix. For example `posts.system.indexes`.

Example:

    
    var mongodb = require("mongodb"),
        mongoserver = new mongodb.Server("localhost"),
        db_connector = new mongodb.Db("blog", mongoserver);

    db_connector.open(function(err, db){
        db.collectionNames(function(err, collections){
            console.log(collections); // ["blog.posts", "blog.system.indexes"]
        });
    });
    

## Selecting collections

Existing collections can be opened with `collection`

    db.collection("name", callback);

If strict mode is off, then a new collection is created if not already present.

## Emtpying collections

All the records from a collection can be erased with `remove`

    collection.remove(callback);
    
## Removing collections

A collection can be dropped with `drop`

    collection.drop(callback);

or with `dropCollection`

    db.dropCollection(collection_name, callback)
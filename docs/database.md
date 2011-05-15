Database
========

The first thing to do in order to make queries to the database is to open one. This can be done with the `Db` constructor.

    var mongodb = require("mongodb"),
        mongoserver = new mongodb.Server(host, port, server_options),
        db_connector = new mongodb.Db(name, mongoserver, db_options);
        
    db_connector.open(callback);
    
  * `host` is a server hostname or IP
  * `port` is a MongoDB port, use `mongodb.Connection.DEFAULT_PORT` for default (27017)
  * `server_options` indicates some special options, for example `{auto_reconnect: true}` to reconnect automatically
  * `name` is the databse name that needs to be opened, database will be created automatically if it doesn't yet exist
  * `db_options` see *DB options*
  
## DB options

Several options can be passed to the `Db` constructor with `options` parameter.

  * `native_parser` - if true, use native BSON parser 
  * `strict` - sets *strict mode*, if true then existing collections can't be "recreated" etc.
  * `pk` - custom primary key factory to generate `_id` values (see Custom primary keys).

## Opening a database

Database can be opened with Db method `open`. 

    db_connector.open(callback);

`callback` is a callback function which gets 2 parameters - an error object (or null, if no errors occured) and a database object.

Resulting database object can be used for creating and selecting [collections](collections.md).

    db_connector.open(function(err, db){
        db.collection(...);
    });

## Deleting a database

To delete a database you need a pointer to it first. Deletion can be done with method `dropDatabase`.

    db_connector.open(function(err, db){
        db.dropDatabase()
    });
    
## Custom primary keys

Every record in the database has an unique primary key called `_id`. Default primary keys are 12 byte hashes but a custom key generator can be used for something else. If you set `_id` "by hand" when
inserting records then you can use whatever you want, primary key factory generates `_id` values only for records without ones.

Example 1: No need to generate primary key, as its already defined:

    collection.insert({name:"Daniel", _id:"12345"});

Example 2: No primary key, so it needs to be generated before save:

    collectionn.insert({name:"Daniel"});

Custom primary key factory is actually an object with method `createPK` which returns a primary key. 
The context (value for `this`) for `createPK` is left untouched.

    var CustomPKFactory = {
        counter:0,
        createPk: function() {
            return ++this.counter;
        }
    } 

    db_connector = new mongodb.Db(name, mongoserver, {pk: CustomPKFactory});


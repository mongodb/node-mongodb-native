Database
========

The first thing to do in order to make queries to the database is to open one. THis can be done with the `Db` constructor.

    var mongodb = require("mongodb");
    var db_connector = new mongodb.Db(name, new mongodb.Server(host, port), options);
    db_connector.open(callback);
    
## DB options

## Opening a database

db_connector.open(callback)

## Deleting a database

database.dropDatabase(callback)
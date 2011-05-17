Indexes
=======

Indexes are needed to make queries faster. For example if you need to find records by a field named *username* and 
the field has a related index set, then the query will be a lot faster compared to if the index was not present.

See [MongoDB documentation](http://www.mongodb.org/display/DOCS/Indexes) for details.

## Create indexes with createIndex()

`createIndex` adds a new index to a collection. For checking if the index was already set, use `ensureIndex` instead.

    collection.createIndex(index[, options], callback)

or

    db.createIndex(collectionname, index[, options], callback)
    
where

  * `index` is the field or fields to be indexed. See *index field*
  * `options` are options, for example `{sparse: true}` to include only records that have indexed field set or `{unique: true}` for unique indexes.
  * `callback` gets two parameters - an error object (if an error occured) and the name for the newly created index

## Ensure indexes with ensureIndex()

Same as `createIndex` with the difference that the index is checked for existence before adding to avoid duplicate indexes.

## Index field

Index field can be a simple string like `"user"` to index certain field (in this case, named as *user*).

It is possible to index fields inside nested objects, for example `"user.firstaname"` to index field named *firstname* inside a document named *user*.

It is also possible to create mixed indexes to include several fields at once.

    {"firstname":1, "lastname":1}
    
The number value indicates direction - if it's 1, then it is an ascending value,
if it's -1 then it's descending. For example if you have documents with a field *date* and you want to sort these records in descending order then you might want to add correcponding index

    collection.ensureIndex({"date":-1}, callback)

## Remove indexes with dropIndex()

All indexes can be dropped at once with `dropIndexes`

    collection.dropIndexes(callback)

## Get index information with indexInformation()

`indexInformation` can be used to fetch some useful information about collection indexes. 

    collection.indexInformation(callback)
    
Where `callback` gets two parameters - an error object (if an error occured) and an array of index information objects.
Inserting and updating
======================

## Insert

Records can be inserted to a collection with `insert`

    collection.insert(docs[, options, callback])
    
Where

  * `docs` is a single document object or an array of documents
  * `options` is an object of parameters, if you use a callback, set `safe` to true - this way the callback is executed *after* the record is saved to the database, if `safe` is false (default) callback is fired immediately and thus doesn't make much sense.
  * `callback` - callback function to run after the record is inserted. Set `safe` to true in `options` when using callback. First parameter for callbac
    is the error object (if an error occured) and the second is an array of records inserted. 

For example

    var document = {name:"David", title:"About MongoDB"};
    collection.insert(document, {safe: true}, function(err, records){
        console.log("Record added as "+records[0]._id);
    });

Simple update can be done as a regular insert but with the `_id` value set - if a record with this id value exists,
it will be overwritten.

## Update

Updates can be done with `update`

    collection.update(criteria, objNew[, options[, callback]]);

Where

  * `criteria` is a query object to find records that need to be updated
  * `objNew` is the replacement object
  * `options` is an options object (see below)
  
### Update options

There are several option values that can be used with an update

  * `safe` - run callback only after the update is done, defaults to false
  * `multi` - update all records that match the query object, default is false (only the first one found is updated)
  * `upsert` - if true and no records match the query, insert `newObj` as a new record 

### Replacement object

If the replacement object is a document, the matching documents will be replaced.

    collection.update({_id:"123"}, {author:"Jessica", title:"Mongo facts"});
    
The example above will replace the document contents of id=123 with the replacement object.

To update only selected fields, `$set` operator needs to be used. Following replacement object
replaces author value but leaves everything else intact.

    collection.update({_id:"123"}, {$set: {author:"Jessica"}});
    
See [MongoDB documentation](http://www.mongodb.org/display/DOCS/Updating) for all possible operators.
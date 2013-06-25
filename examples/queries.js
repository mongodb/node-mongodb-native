var MongoClient = require('../lib/mongodb').MongoClient
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

console.log("Connecting to " + host + ":" + port);

MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), function(err, db) {
  db.dropDatabase(function() {
    // Fetch the collection test
    var collection = db.collection('test');
    // Remove all records in collection if any
    collection.remove(function(err, result) {
      // Insert three records
      collection.insert([{'a':1}, {'a':2}, {'b':3}], {w:1}, function(docs) {
        // Count the number of records
        collection.count(function(err, count) {
          console.log("There are " + count + " records.");
        });
        
        console.log("Printing docs from Cursor Each")
        // Find all records. find() returns a cursor
        // Print each row, each document has an _id field added on insert
        // to override the basic behaviour implement a primary key factory
        // that provides a 12 byte value
        collection.find().each(function(err, doc) {
          if(doc != null) console.log("Doc from Each ");
          console.dir(doc);
        });
        // Cursor has an to array method that reads in all the records to memory
        collection.find().toArray(function(err, docs) {
          console.log("Printing docs from Array")
          docs.forEach(function(doc) {
            console.log("Doc from Array ");
            console.dir(doc);
          });
        });
        
        // Different methods to access records (no printing of the results)
        
        // Locate specific document by key
        collection.find({'a':1}).nextObject(function(err, doc) {            
          console.log("Returned #1 documents");
        });
        
        // Find records sort by 'a', skip 1, limit 2 records
        // Sort can be a single name, array, associate array or ordered hash
        collection.find({}, {'skip':1, 'limit':1, 'sort':'a'}).toArray(function(err, docs) {            
          console.log("Returned #" + docs.length + " documents");
        })          
        
        // Find all records with 'a' > 1, you can also use $lt, $gte or $lte
        collection.find({'a':{'$gt':1}}).toArray(function(err, docs) {
          console.log("Returned #" + docs.length + " documents");
        });
        
        collection.find({'a':{'$gt':1, '$lte':3}}).toArray(function(err, docs) {
          console.log("Returned #" + docs.length + " documents");
        });          
        
        // Find all records with 'a' in a set of values
        collection.find({'a':{'$in':[1,2]}}).toArray(function(err, docs) {
          console.log("Returned #" + docs.length + " documents");
        });          
        
        // Find by regexp
        collection.find({'a':/[1|2]/}).toArray(function(err, docs) {
          console.log("Returned #" + docs.length + " documents");
        });          

        // Print Query explanation
        collection.find({'a':/[1|2]/}).explain(function(err, doc) {
          console.log("-------------------------- Explanation");
          console.dir(doc);
        })

        // Use a hint with a query, hint's can also be store in the collection
        // and will be applied to each query done through the collection.
        // Hint's can also be specified by query which will override the 
        // hint's associated with the collection
        collection.createIndex('a', function(err, indexName) {
          collection.hint = 'a';

          // You will see a different explanation now that the hint was set
          collection.find({'a':/[1|2]/}).explain(function(err, doc) {
            console.log("-------------------------- Explanation");
            console.dir(doc);
          })

          collection.find({'a':/[1|2]/}, {'hint':'a'}).explain(function(err, doc) {
            console.log("-------------------------- Explanation");
            console.dir(doc);
            db.close();
          })
        });    
      });
    });    
  });
});

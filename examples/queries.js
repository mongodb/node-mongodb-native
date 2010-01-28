require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

require("mongodb/db");
require("mongodb/bson/bson");
require("mongodb/gridfs/gridstore");

var host = process.ENV['MONGO_NODE_DRIVER_HOST'] != null ? process.ENV['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.ENV['MONGO_NODE_DRIVER_PORT'] != null ? process.ENV['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

sys.puts("Connecting to " + host + ":" + port);
var db = new Db('node-mongo-examples', new Server(host, port, {}), {});
db.addListener("connect", function(db) {
  db.dropDatabase(function() {
    // Fetch the collection test
    db.collection(function(collection) {
      // Remove all records in collection if any
      collection.remove(function(collection) {
        // Insert three records
        collection.insert([{'a':1}, {'a':2}, {'b':3}], function(docs) {
          // Count the number of records
          collection.count(function(count) {
            sys.puts("There are " + count + " records.");
          });
          
          // Find all records. find() returns a cursor
          collection.find(function(cursor) {
            // Print each row, each document has an _id field added on insert
            // to override the basic behaviour implement a primary key factory
            // that provides a 12 byte value
            sys.puts("Printing docs from Cursor Each")
            cursor.each(function(doc) {
              if(doc != null) sys.puts("Doc from Each " + sys.inspect(doc.unorderedHash()));
            })                    
          });
          // Cursor has an to array method that reads in all the records to memory
          collection.find(function(cursor) {
            cursor.toArray(function(docs) {
              sys.puts("Printing docs from Array")
              docs.forEach(function(doc) {
                sys.puts("Doc from Array " + sys.inspect(doc.unorderedHash()));
              });
            });
          });
          
          // Different methods to access records (no printing of the results)
          
          // Locate specific document by key
          collection.find(function(cursor) {
            cursor.nextObject(function(doc) {            
              sys.puts("Returned #1 documents");
            });
          }, {'a':1});
          
          // Find records sort by 'a', skip 1, limit 2 records
          // Sort can be a single name, array, associate array or ordered hash
          collection.find(function(cursor) {
            cursor.toArray(function(docs) {            
              sys.puts("Returned #" + docs.length + " documents");
            })          
          }, {}, {'skip':1, 'limit':1, 'sort':'a'});
          
          // Find all records with 'a' > 1, you can also use $lt, $gte or $lte
          collection.find(function(cursor) {
            cursor.toArray(function(docs) {
              sys.puts("Returned #" + docs.length + " documents");
            });
          }, {'a':{'$gt':1}});
          
          collection.find(function(cursor) {
            cursor.toArray(function(docs) {
              sys.puts("Returned #" + docs.length + " documents");
            });          
          }, {'a':{'$gt':1, '$lte':3}});
          
          // Find all records with 'a' in a set of values
          collection.find(function(cursor) {
            cursor.toArray(function(docs) {
              sys.puts("Returned #" + docs.length + " documents");
            });          
          }, {'a':{'$in':[1,2]}});        
          
          // Find by regexp
          collection.find(function(cursor) {
            cursor.toArray(function(docs) {
              sys.puts("Returned #" + docs.length + " documents");
            });          
          }, {'a':/[1|2]/});          

          // Print Query explanation
          collection.find(function(cursor) {
            cursor.explain(function(doc) {
              sys.puts("-------------------------- Explanation");
              sys.puts(sys.inspect(doc.unorderedHash()));
            })
          }, {'a':/[1|2]/});   

          // Use a hint with a query, hint's can also be store in the collection
          // and will be applied to each query done through the collection.
          // Hint's can also be specified by query which will override the 
          // hint's associated with the collection
          collection.createIndex(function(indexName) {
            collection.hint = 'a';

            // You will see a different explanation now that the hint was set
            collection.find(function(cursor) {
              cursor.explain(function(doc) {
                sys.puts("-------------------------- Explanation");
                sys.puts(sys.inspect(doc.unorderedHash()));
              })
            }, {'a':/[1|2]/});             

            collection.find(function(cursor) {
              cursor.explain(function(doc) {
                sys.puts("-------------------------- Explanation");
                sys.puts(sys.inspect(doc.unorderedHash()));
                db.close();
              })
            }, {'a':/[1|2]/}, {'hint':'a'});             
          }, 'a');    
        });
      });
    }, 'test');    
  });
});
db.open();





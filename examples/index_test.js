require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

var mongo = require('mongodb/db');
process.mixin(mongo, require('mongodb/connection'));
process.mixin(mongo, require('mongodb/bson/bson'));
process.mixin(mongo, require('mongodb/goog/math/integer'));

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : mongo.Connection.DEFAULT_PORT;

sys.puts(">> Connecting to " + host + ":" + port);
var db = new mongo.Db('node-mongo-examples', new mongo.Server(host, port, {}), {});
db.open(function(db) {
  sys.puts(">> Dropping collection test");
  db.dropCollection('test', function(err, result) {
    sys.puts("dropped: " + sys.inspect(result));
  });
  
  sys.puts(">> Creating collection test");
  db.collection('test', function(err, collection) {
    sys.puts("created: " + sys.inspect(collection));    

    var objectCount = 100;
    var objects = [];
    var messages = ["hola", "hello", "aloha", "ciao"];
    sys.puts(">> Generate test data");
    for(var i = 0; i < objectCount; i++) {
      objects.push({'number':i, 'rndm':((5*Math.random()) + 1), 'msg':messages[mongo.Integer.fromNumber((4*Math.random())).toInt()]})
    }
    sys.puts("generated");

    sys.puts(">> Inserting data (" + objects.length + ")");
    collection.insert(objects);
    sys.puts("inserted");
    
    sys.puts(">> Creating index")
    collection.createIndex([['all'], ['_id', 1], ['number', 1], ['rndm', 1], ['msg', 1]], function(err, indexName) {
      sys.puts("created index: " + indexName);      
      
      sys.puts(">> Gathering index information");
            
      collection.indexInformation(function(err, doc) {
        sys.puts("indexInformation: " + sys.inspect(doc));                    
        
        sys.puts(">> Dropping index");
        collection.dropIndex('all_1__id_1_number_1_rndm_1_msg_1', function(err, result) {
          sys.puts("dropped: " + sys.inspect(result));          

          sys.puts(">> Gathering index information");
          collection.indexInformation(function(err, doc) {
            sys.puts("indexInformation: " + sys.inspect(doc));              
            sys.puts(">> Closing connection");
            db.close();
          });      
        });
      });      
    });
  });
});
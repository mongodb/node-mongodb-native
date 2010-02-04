require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

require("mongodb/db");
require("mongodb/bson/bson");
require("mongodb/gridfs/gridstore");

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

sys.puts(">> Connecting to " + host + ":" + port);
var db = new Db('node-mongo-examples', new Server(host, port, {}), {});
db.open(function(db) {
  sys.puts(">> Dropping collection test");
  db.dropCollection(function(result) {
    sys.puts("dropped: " + sys.inspect(result));
  }, 'test');
  
  sys.puts(">> Creating collection test");
  db.collection(function(collection) {
    sys.puts("created: " + sys.inspect(collection));    

    var objectCount = 100;
    var objects = [];
    var messages = ["hola", "hello", "aloha", "ciao"];
    sys.puts(">> Generate test data");
    for(var i = 0; i < objectCount; i++) {
      objects.push({'number':i, 'rndm':((5*Math.random()) + 1), 'msg':messages[Integer.fromNumber((4*Math.random())).toInt()]})
    }
    sys.puts("generated");

    sys.puts(">> Inserting data (" + objects.length + ")");
    collection.insert(objects);
    sys.puts("inserted");
    
    sys.puts(">> Creating index")
    collection.createIndex(function(indexName) {
      sys.puts("created index: " + indexName);      
      
      sys.puts(">> Gathering index information");
            
      collection.indexInformation(function(doc) {
        sys.puts("indexInformation: " + sys.inspect(doc));                    
        
        sys.puts(">> Dropping index");
        collection.dropIndex('all_1__id_1_number_1_rndm_1_msg_1', function(result) {
          sys.puts("dropped: " + sys.inspect(result));          

          sys.puts(">> Gathering index information");
          collection.indexInformation(function(doc) {
            sys.puts("indexInformation: " + sys.inspect(doc));              
            sys.puts(">> Closing connection");
            db.close();
          });      
        });
      });
      
    }, [['all'], ['_id', 1], ['number', 1], ['rndm', 1], ['msg', 1]]);
  }, 'test');
});
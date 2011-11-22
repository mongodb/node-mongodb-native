GLOBAL.DEBUG = true;

test = require("assert");

var Db = require('../lib/mongodb').Db,
  Connection = require('../lib/mongodb').Connection,
  Server = require('../lib/mongodb').Server,
  mongo = require('../lib/mongodb');

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

console.log(">> Connecting to " + host + ":" + port);
var db = new Db('node-mongo-examples', new Server(host, port, {}), {native_parser:true});
db.open(function(err, db) {
  console.log(">> Dropping collection test");
  db.dropCollection('test', function(err, result) {
    console.log("dropped: ");
    console.dir(result);
  });
  
  console.log(">> Creating collection test");
  db.collection('test', function(err, collection) {
    console.log("created: ");
    console.dir(collection);    

    var objectCount = 100;
    var objects = [];
    var messages = ["hola", "hello", "aloha", "ciao"];
    console.log(">> Generate test data");
    for(var i = 0; i < objectCount; i++) {
      objects.push({'number':i, 'rndm':((5*Math.random()) + 1), 'msg':messages[parseInt(4*Math.random())]})
    }
    console.log("generated");

    console.log(">> Inserting data (" + objects.length + ")");
    collection.insert(objects);
    console.log("inserted");
    
    console.log(">> Creating index")
    collection.createIndex([['all'], ['_id', 1], ['number', 1], ['rndm', 1], ['msg', 1]], function(err, indexName) {
      console.log("created index: " + indexName);      
      
      console.log(">> Gathering index information");
            
      collection.indexInformation(function(err, doc) {
        console.log("indexInformation: ");
        console.dir(doc);
        
        console.log(">> Dropping index");
        collection.dropIndex('all_1__id_1_number_1_rndm_1_msg_1', function(err, result) {
          console.log("dropped: ");
          console.dir(result);

          console.log(">> Gathering index information");
          collection.indexInformation(function(err, doc) {
            console.log("indexInformation: ");
            console.dir(doc);
            console.log(">> Closing connection");
            db.close();
          });      
        });
      });      
    });
  });
});
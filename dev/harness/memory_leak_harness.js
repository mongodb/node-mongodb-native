var http = require('http'),
  Server = require('../lib/mongodb').Server,
  ObjectID = require('../lib/mongodb').ObjectID,
  Db = require('../lib/mongodb').Db;

// Set up the mongodb instance
var db = new Db('memory_leak_harness', new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser:false});

// Set up http server
var server = http.createServer();
server.on('request', function(request, response) {
  // Fetch the url
  var url = request.url;
  
  // Switch on the url
  if(url === "/findAndModify") {
    findAndModifyCommand(request, response);
  } else {
    response.end('Command not supported');          
  }
})

// Open the db connection
db.open(function(err, db) {
  server.listen(8080, '127.0.0.1');  
});

// Find And Modify Command
var findAndModifyCommand = function(request, response) {
  // Perform an insert and the modify that one
  var objectId = new ObjectID();
  // Fetch collection and insert document then modify it
  db.createCollection('findAndModify', function(err, collection) {
    collection.insert({_id:objectId, a:1, b:true, date:new Date()}, {safe:true}, function(err, result) {
      if(err != null) {
        response.end("findAndModifyCommand ERROR :: " + err.toString());        
        return;
      }
      
      // Perform the modifyAndModify
      collection.findAndModify({_id:objectId}, [['_id', 1]], {'$set':{'a':2}}, {'new':true, safe:true}, function(err, updated_doc) {
        response.end("findAndModifyCommand SUCCESS :: " + JSON.stringify(updated_doc));        
      });
    })
  });
}
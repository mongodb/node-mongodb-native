require.paths.unshift("lib");
require("mongodb/connection");
require("mongodb/db");

sys = require("sys");

require("mongodb/bson/bson")
require("mongodb/bson/collections")
require("mongodb/bson/binary_parser")
require("goog/math/integer")
require("goog/math/long")

sys = require("sys");

// var a = {b:23, a:12, d:14, c:45};
// var b = {2:32, 1:12};
// var c = [{2:32}, {1:12}];
// 
// for(var i in a) {
//  sys.puts("=== " + i);
// }
// 
// for(var i in b) {
//  sys.puts("=== " + i);
// }
// 
// for(var i in c) {
//   sys.puts("===" + sys.inspect(c[i]));
// }
// 
// var a = new BSON().serialize(new OrderedHash().add('a', 1));
// new BinaryParser().pprint(a);
// var b = new BSON().deserialize(b);

// List off all the nodes
// var nodes = [{host: "127.0.0.1", port: 27017}, {host: "127.0.0.1", port: 27017}];
var nodes = [{host: "127.0.0.1", port: 27017}];
// Create a db object
var db = new Db('test', nodes, {});
db.addListener("connect", function() {
  // We can now use the db to access stuff
  // this.collections_info(null, function(reply) {
  //   sys.puts("db.collections_info callback");
  //   for(var index in reply[0].documents) {
  //     var document = reply[0].documents[index];
  //     sys.puts("name: " + document.name);      
  //   }
  // });
  // 
  // this.collection_names(null, function(reply) {
  //   sys.puts("db.collection_names callback");    
  //   for(var index in reply[0].documents) {
  //     var document = reply[0].documents[index];
  //     sys.puts("name: " + document.name);      
  //   }
  // });  
    
  // setInterval(function() {
  //   db.collection_names(null, function(reply) {
  //     sys.puts("db.collection_names callback 2");    
  //     for(var index in reply[0].documents) {
  //       var document = reply[0].documents[index];
  //       // sys.puts("name: " + document.name);      
  //     }
  //   });    
  // }, 1);
  
  // for(var i = 0; i < 10000; i++) {
  //   this.collection_names(null, function(reply) {
  //     sys.puts("db.collection_names callback 2");    
  //     for(var index in reply[0].documents) {
  //       var document = reply[0].documents[index];
  //       sys.puts("name: " + document.name);      
  //     }
  //   });
  // }

  // db.collection_names(null, function(reply) {
  //   sys.puts("db.collection_names callback 2");    
  //   for(var index in reply[0].documents) {
  //     var document = reply[0].documents[index];
  //     sys.puts("name: " + document.name);      
  //   }
  // });


  // this.authenticate("admin", "admin", function(reply){
  //   sys.puts("authentication request");
  //   sys.puts(sys.inspect(reply[0].is_error()));
  //   sys.puts(sys.inspect(reply[0].error_message()));
  //   // Logout
  //   // db.logout(function(reply) {
  //   //   sys.puts("executed logout command");
  //   //   // sys.puts(sys.inspect(reply));
  //   // });
  //   db.lastError(function(reply) {
  //     sys.puts("got last error");
  //     sys.puts(sys.inspect(reply));
  //   });
  // });
  
  // db.createCollection("crazy", function(reply) {
  //   sys.puts("================== collection create function executed");
  //   // db.dropCollection("crazy", function(reply) {
  //   //   sys.puts("================== collection drop function executed");      
  //   // });
  // });

  // db.renameCollection("crazy", "crazy2", function(reply) {
  //   sys.puts("================== collection rename function executed");      
  // });

  // db.dropCollection("crazy2", function(reply) {
  //   sys.puts("================== collection drop function executed");      
  // });
});
// Open the app
db.open();
// Let's call a list of all collection names in the specified db
// db.collections_info(null, function(reply) {
//   sys.puts("db.collections_info callback");
// });


// Close the database
// db.close();

// var connection = new Connection('127.0.0.1', 27017);
// sys.puts("Connection created");
// connection.addListener("connect", function() {
//   sys.puts("Tcp Connection connected");
// });

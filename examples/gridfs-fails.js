GLOBAL.DEBUG = true;

sys = require("sys");
test = require("assert");
fs = require('fs');

var Db = require('../lib/mongodb').Db,
  Connection = require('../lib/mongodb').Connection,
  Server = require('../lib/mongodb').Server,
  GridStore = require('../lib/mongodb').GridStore,
  // BSON = require('../lib/mongodb').BSONPure;
  BSON = require('../lib/mongodb').BSONNative;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

sys.puts(">> Connecting to " + host + ":" + port);
var db1 = new Db('gridfs-test', new Server(host, port, {}), {native_parser:true});
db1.open(function(err, db) {
  // Write a new file
  var gridStore = new GridStore(db, "foobar", "w");
  gridStore.open(function(err, gridStore) {    
  	sys.puts(process.cwd()+'/file-input.jpg');
	fs.readFile(process.cwd()+'/file-input.jpg', function(err, data)  {
		gridStore.write(data, true, function(err, gridStore)  {
			gridStore.close(function(err, result) {
				dump(db, 'foobar');
			});
		});
	});
  
 });
 
 function dump(db, filename, callback) {
	  GridStore.read(db, filename, function(err, data) {
	    fs.writeFile(process.cwd() + '/file-output.jpg', data, function(err, result)  {
	    	sys.puts('File written');	
	    });
	  }); 
 }
 
});
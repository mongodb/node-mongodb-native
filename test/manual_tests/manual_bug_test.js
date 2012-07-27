var mongodb = require('../../lib/mongodb').pure();
var Db = mongodb.Db;
var Server = mongodb.Server;
var ObjectID = mongodb.ObjectID;
var Collection = mongodb.Collection;
var ReplSetServers = mongodb.ReplSetServers;

var useSSL = false;
var databasename = 'nodedb';
var username = 'user';
var password = 'pass';

var replSet = new ReplSetServers([
  new Server( 'localhost', 30000, { auto_reconnect: false } ),
  new Server( 'localhost', 30001, { auto_reconnect: false } )
], {rs_name:'replica-set-foo'});

var client = new Db(databasename, replSet, {native_parser: false});
client.on("fullsetup", function(err, result) {
	if (err){
	  console.log('ERR:'+err);
	  console.log('DB:'+db_p);
	}

	client.authenticate(username, password, function(err, replies) {
	  if (err){
	    console.log('ERR AUTH:'+err);
	    console.log('replies:'+replies);
	  }
        
	  // var ensureIndexOptions = { unique: true, safe: true, background: true };    
	  var ensureIndexOptions = { unique: true, safe: false, background: true };    
	  // Just cleanup
	  client.collection('userconfirm').ensureIndex({ 'confirmcode':1 }, ensureIndexOptions, function(err, item){
	    if(err){
	      console.log('Userconfirm ensure index failed:'+err);
	    }

	    client.collection('session').ensureIndex({ 'sid': 1 }, ensureIndexOptions, function(err, res){
	      if(err){
	        console.log('Session ensure index failed'+err);
	      }

	      client.close();
	    });
	  });
	});	
})

client.open(function(err, db_p) {
});

var http            = require('http'),
    os              = require('os'),
    mongodb         = require('../../../lib/mongodb'),
    Server          = mongodb.Server,
    ReadPreference = mongodb.ReadPreference,
    ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager,
    ReplSetServers  = mongodb.ReplSetServers,
    Db              = mongodb.Db,
    MongoClient     = mongodb.MongoClient;

console.log('launching simple mongo application...');
// var url = "mongodb://localhost:30000,localhost:30001,localhost:30002/foo&readPreference=secondaryPreferred"
// var url = "mongodb://192.168.2.173:30000,192.168.2.173:30001,192.168.2.173:30002/foo&readPreference=secondaryPreferred";
var url = "mongodb://localhost:27017/test"
// var writeOptions = {w:3};
var writeOptions = {w:1};

// Connect
MongoClient.connect(url, function(err, db) {
	if(err) throw console.log('database open error %o', err);

	// Insert a single row
	db.collection('foo').remove(function(err) {
		if(err) throw err;

		db.collection('foo').insert({a:1, b:'hello'}, writeOptions, function(err, r) {
			if(err) throw err;

			startServer(db);
		})
	});
});

var startServer = function(db) {
	// Create a new server
	http.createServer(function (req, res) {
		var collection = db.collection('foo');

		// Execute findOne
		collection.findOne({a:1}, function(err, doc) {
			if(err) return res.end(err.message);
			res.end(JSON.stringify(doc));
		});
	}).listen(8000);	
}
var mongodb = require('../../../lib/mongodb')
	, MongoClient = mongodb.MongoClient
  , ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager;

// var mongodb = require('mongodb')
// 	, MongoClient = mongodb.MongoClient
//   , ReplicaSetManager = require('/Users/ck/coding/projects/node-mongodb-native/test/tools/replica_set_manager').ReplicaSetManager;

var populateDb = function(count, db, callback) {
	var docs = [];
	console.log("============================== populateDb :: " + count)
	if(count == 0) return callback();

	for(var i = 0; i < 1000; i++) {
		docs.push({a:1, string: 'hello'});
	}

	db.collection('test').insert(docs, function(err, result) {
		populateDb(count - 1, db, callback);
	})
}

var streamData = function(db) {
	var cursor = db.collection('test').find({});
	var stream = cursor.stream();
	stream.on('data', function(data) {
		console.log("=== received data")
	});

	stream.on('error', function(err) {
		console.dir(err)
	});

	stream.on('end', function() {
		console.log("end")
		process.nextTick(function() {
			streamData(db);			
		})
	});	
}

var RS = new ReplicaSetManager({name:"testReplSet", retries:120, secondary_count:2, passive_count:0, arbiter_count:0});
RS.startSet(true, function(err, result) {
	MongoClient.connect("mongodb://localhost:30001/test", function(err, db) {
		if(err) throw err;

		populateDb(100, db, function(err, result) {
			streamData(db)
		});
	});
});
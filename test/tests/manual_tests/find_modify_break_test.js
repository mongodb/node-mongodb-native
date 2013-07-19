var mongodb = require("../../../lib/mongodb")
  , MongoClient = mongodb.MongoClient
	, request = true;

// var x = new ReplSetTest({"nodes" : {node0 : {}, node1 : {}, arbiter : {}}})
// x.startSet();
// var config = x.getReplSetConfig()
// config.members[0].priority = 10
// x.initiate(config);
// // once running, start the node script
// x.stopMaster(); // shut down master
// x.start(0); // restart the master

MongoClient.connect('mongodb://127.0.0.1:31000/test_db', function(err, db) {
	if(err) {
		console.error(err);
	}

	var collection = db.collection('test_collection');

	// define find and modify
	var findAndModifyLoop = function() {
		collection.findAndModify({hello: 'world'}, [['_id', 'asc']], {$set: {hi: 'there'}},{w:0, upsert:true}, function(err, object) {
      findAndModifyLoop();                    
		});
	};

	// start the loop
	findAndModifyLoop();
});
var mongodb = require("../../lib/mongodb"),
	request = true;

var db = new mongodb.Db('test_db', new mongodb.Server("127.0.0.1", 27017, {
	auto_reconnect: false
}), {});

// listen on error
db.on("error", function(err) {
	console.log('open request ', request);
	console.error('db on error');
	console.dir(err);
});

// open connection
db.open(function(err, client) {
	if (err) {
		console.error(err);
	}

	var collection = new mongodb.Collection(client, 'test_collection');

	// define find and modify
	var findAndModifyLoop = function() {
			// mark request = true as sending mongo request
			request = true;

			console.log('findAndModify request (should not be last)');

			collection.findAndModify({hello: 'world'}, [['_id', 'asc']], {$set: {hi: 'there'}},{safe:true}, function(err, object) {
				if (err) {
					console.warn('findAndModify response ', err.message); // returns error if no matching object found
				} else {
					console.log('findAndModify response', object);
				}

				// no more out standing request
				request = false;

				// on result does it again
				findAndModifyLoop();
			});
		};

	// start the loop
	findAndModifyLoop();
});

db.on("error", function(err) {
  console.log('open request ', request);
  console.error('db on error');
  console.dir(err);
});

db.on("close", function(err) {
  console.log('open request ', request);
  console.error('db on close');
  console.dir(err);
});
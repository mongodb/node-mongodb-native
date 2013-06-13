var heapdump = require('heapdump');
var mongodb = require("../../../lib/mongodb")
  , MongoClient = mongodb.MongoClient
	, request = true;

// var db = new mongodb.Db('test_db', new mongodb.Server("127.0.0.1", 27017, {
// 	auto_reconnect: true
// }), {});

// // listen on error
// db.on("error", function(err) {
// 	console.log('open request ', request);
// 	console.error('db on error');
// 	console.dir(err);
// });

// open connection
// db.open(function(err, client) {
MongoClient.connect('mongodb://127.0.0.1:31000/test_db', function(err, db) {
	if (err) {
		console.error(err);
	}

	var collection = db.collection('test_collection');

	// define find and modify
	var findAndModifyLoop = function() {
			// mark request = true as sending mongo request
			request = true;

			// console.log('findAndModify request (should not be last)');

      // collection.find({hello: 'world'}).toArray(function(err, docs) {
			collection.findAndModify({hello: 'world'}, [['_id', 'asc']], {$set: {hi: 'there'}},{w:1, upsert:true}, function(err, object) {
				// if (err) {
				// 	console.warn('findAndModify error response ', err.message); // returns error if no matching object found
				// } else {
				// 	console.log('findAndModify response', object);
				// }

				// no more out standing request
				request = false;
        heapdump.writeSnapshot();
        // process.nextTick(function() {
        setTimeout(function() {
          findAndModifyLoop();                    
        }, 1000 * 10)
          // console.dir("number of callbacks :: " + Object.keys(db.serverConfig._callBackStore._notReplied).length);
  				// on result does it again
  				// findAndModifyLoop();          
        // })
			});
		};

	// start the loop
	findAndModifyLoop();
});

// setInterval(function() {
//   heapdump.writeSnapshot();
// }, 10000)

// db.on("error", function(err) {
//   console.log('open request ', request);
//   console.error('db on error');
//   console.dir(err);
// });

// db.on("close", function(err) {
//   console.log('open request ', request);
//   console.error('db on close');
//   console.dir(err);
// });
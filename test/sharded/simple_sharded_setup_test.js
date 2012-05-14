var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ShardedManager = require('../tools/sharded_manager').ShardedManager,
  Db = mongodb.Db,
  Mongos = mongodb.Mongos,
  Server = mongodb.Server;

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;
var Shard = Shard == null ? null : Shard;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  Shard = new ShardedManager({
      // A single replicaset in our sharded system
      numberOfReplicaSets:1,
      replPortRangeSet:30000,
      // A single configuration server
      numberOfConfigServers:1,
      configPortRangeSet:40000,
      // Two mongos proxies to ensure correct failover
      numberOfMongosServers:2,
      mongosRangeSet:50000,
      // Collection and shard key setup
      db:"sharded_test_db",
      collection:"sharded_test_db_collection",
      shardKey: "_id"      
    })
    
  // Start the shard
  Shard.start(function(err, result) {
    callback();
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
	Shard.killAll(function() {
  	callback();
	});
}

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyConnectToMongoSShardedSetup = function(test) {
//   // Set up mongos connection
//   var mongos = new Mongos([
//       new Server("localhost", 50000, { auto_reconnect: true }),
//       new Server("localhost", 50001, { auto_reconnect: true })
//     ])
//   
//   // Connect using the mongos connections
//   var db = new Db('integration_test_', mongos);
//   db.open(function(err, db) {
// 		test.equal(null, err);
// 		test.ok(db != null);
// 	
// 		// Perform a simple insert into a collection
// 		var collection = db.collection("shard_test");
// 		// Insert a simple doc
// 		collection.insert({test:1}, {safe:true}, function(err, result) {
// 			test.equal(null, err);
// 			
// 			db.close();
// 	    test.done();
// 		});
//   });  
// }

/**
 * @ignore
 */
exports.shouldCorrectlyConnectToMongoSShardedSetupAndKillTheMongoSProxy = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ], {ha:true})
  
  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos);
  db.open(function(err, db) {
		test.equal(null, err);
		test.ok(db != null);
	
		// Perform a simple insert into a collection
		var collection = db.collection("shard_test");
		// Insert a simple doc
		collection.insert({test:1}, {safe:true}, function(err, result) {
			test.equal(null, err);
			
			// Kill the mongos proxy
			Shard.killMongoS(50000, function(err, result) {
				
				// Attempt another insert
				collection.insert({test:2}, {safe:true}, function(err, result) {
					test.equal(null, err);
					test.equal(1, db.serverConfig.downServers.length);
								
					// Restart the other mongos
					Shard.restartMongoS(50000, function(err, result) {
						
						// Wait for the ha process to pick up the existing new server
						setTimeout(function() {
							test.equal(0, db.serverConfig.downServers.length);

							// Kill the mongos proxy
							Shard.killMongoS(50001, function(err, result) {
								// Attempt another insert
								collection.insert({test:3}, {safe:true}, function(err, result) {
									test.equal(null, err);
									test.equal(1, db.serverConfig.downServers.length);

									// Restart the other mongos
									Shard.restartMongoS(50001, function(err, result) {
										// Wait for the ha process to pick up the existing new server
										setTimeout(function() {
											// Kill the mongos proxy
											Shard.killMongoS(50000, function(err, result) {
												// Attempt another insert
												collection.insert({test:4}, {safe:true}, function(err, result) {
													test.equal(null, err);

													// Wait for the ha process to pick up the existing new server
													setTimeout(function() {
														test.equal(1, db.serverConfig.downServers.length);

														db.close();
												    test.done();							
													}, 5000);										
												});
											});													
										}, 10000);
									});
								});
							});
						}, 10000)						
					});								
				})
			})			
		});
  });  
}

// /**
//  * Retrieve the server information for the current
//  * instance of the db client
//  * 
//  * @ignore
//  */
// exports.noGlobalsLeaked = function(test) {
//   var leaks = gleak.detectNew();
//   test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
//   test.done();
// }

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;

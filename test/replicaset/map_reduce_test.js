var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  Server = require('../../lib/mongodb').Server,
  Step = require("../../deps/step/lib/step");  

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;
var RS = RS == null ? null : RS;

var ensureConnection = function(test, numberOfTries, callback) {
  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name}
  );
  
  if(numberOfTries <= 0) return callback(new Error("could not connect correctly"), null);

  var db = new Db('integration_test_', replSet);
  // Open the db
  db.open(function(err, p_db) {
    // Close connections
    db.close();    
    // Process result
    if(err != null) {
      // Wait for a sec and retry
      setTimeout(function() {
        numberOfTries = numberOfTries - 1;
        ensureConnection(test, numberOfTries, callback);
      }, 1000);
    } else {
      return callback(null, p_db);
    }    
  })            
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  // Create instance of replicaset manager but only for the first call
  if(!serversUp && !noReplicasetStart) {
    serversUp = true;
    RS = new ReplicaSetManager({retries:120, secondary_count:2, passive_count:0, arbiter_count:1});
    RS.startSet(true, function(err, result) {      
      if(err != null) throw err;
      // Finish setup
      callback();      
    });      
  } else {    
    RS.restartKilledNodes(function(err, result) {
      if(err != null) throw err;
      callback();        
    })
  }
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  numberOfTestsRun = numberOfTestsRun - 1;
  if(numberOfTestsRun == 0) {
    // Finished kill all instances
    RS.killAll(function() {
      callback();              
    })
  } else {
    callback();            
  }  
}

exports['Should Correctly group using replicaset'] = function(test) {
  var self = this;
  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } ),
    ], 
    {rs_name:RS.name, read_secondary:true}
  );

  // Insert some data
  var db = new Db('integration_test_', replSet, {slave_ok:true});
  db.open(function(err, p_db) {
    if(err != null) debug("shouldGroup :: " + inspect(err));

    p_db.createCollection("testgroup_replicaset", {safe:{w:2, wtimeout:10000}}, function(err, collection) {
      if(err != null) debug("shoulGroup :: " + inspect(err));

      collection.insert([{key:1,x:10}, {key:2,x:30}, {key:1,x:20}, {key:3,x:20}], {safe:{w:2, wtimeout:10000}}, function(err, result) {
        // Ensure replication happened in time
        setTimeout(function() {
          // Kill the primary
          RS.killPrimary(function(node) {
            // Do a collection find
            collection.group(['key'], {}, {sum:0}, function reduce(record, memo){
              memo.sum += record.x;
            }, true, function(err, items){
              if(err != null) debug("shouldGroup :: " + inspect(err));
              test.equal(null, err);
              test.equal(3, items.length);                
      
              p_db.close();
              test.done();
            })
          });
        }, 2000);
      })
    });      
  })    
}

exports.shouldPerformMapReduceFunctionInline = function(test) {
  var self = this;
  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } ),
    ], 
    {rs_name:RS.name, read_secondary:true}
  );

  // Establish connection to db  
  var db = new Db('integration_test_', replSet, {slave_ok:true});
  db.open(function(err, db) {
    
    // Parse version of server if available
    db.admin().serverInfo(function(err, result){
      
      // Only run if the MongoDB version is higher than 1.7.6
      if(parseInt((result.version.replace(/\./g, ''))) >= 176) {
        
        // Create a test collection
        db.createCollection('test_map_reduce_functions_inline_map_reduce', {safe:{w:2, wtimeout:10000}}, function(err, collection) {
          // console.log("==================================================================================")
          // console.dir(err)
          
          
          // Insert some test documents
          collection.insert([{'user_id':1}, {'user_id':2}], {safe:true}, function(err, r) {

            // Map function
            var map = function() { emit(this.user_id, 1); };
            // Reduce function
            var reduce = function(k,vals) { return 1; };

            // Execute map reduce and return results inline
            collection.mapReduce(map, reduce, {out : {inline: 1}}, function(err, results) {
              // console.log("=============================================================================")
              // console.dir(err)
              // console.dir(results)
              
              test.equal(2, results.length);
              
              db.close();
              test.done();
            });          
          });
        });      
      } else {
        test.done();
      }
    });
  });
}

exports.shouldFailToDoMapReduceToOutCollection = function(test) {
  var self = this;
  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } ),
    ], 
    {rs_name:RS.name, read_secondary:true}
  );

  // Establish connection to db  
  var db = new Db('integration_test_', replSet, {slave_ok:true});
  db.open(function(err, db) {
    
    // Parse version of server if available
    db.admin().serverInfo(function(err, result){
      
      // Only run if the MongoDB version is higher than 1.7.6
      if(parseInt((result.version.replace(/\./g, ''))) >= 176) {
        
        // Create a test collection
        db.createCollection('test_map_reduce_functions_notInline_map_reduce', {safe:{w:2, wtimeout:10000}}, function(err, collection) {
          
          // Insert some test documents
          collection.insert([{'user_id':1}, {'user_id':2}], {safe:true}, function(err, r) {

            // Map function
            var map = function() { emit(this.user_id, 1); };
            // Reduce function
            var reduce = function(k,vals) { return 1; };

            // Execute map reduce and return results inline
            collection.mapReduce(map, reduce, {out : {replace:'replacethiscollection'}}, function(err, results) {
              test.ok(err != null);
              
              db.close();
              test.done();
            });          
          });
        });      
      } else {
        test.done();
      }
    });
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;

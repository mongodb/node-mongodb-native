var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  gleak = require('../../tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ReplSetServers = mongodb.ReplSetServers,
  ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager,
  Step = require("../../deps/step/lib/step");  

var MONGODB = 'integration_tests';
var serverManager = null;
var RS = RS == null ? null : RS;

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    RS = new ReplicaSetManager({retries:120, 
      ssl:true,
      arbiter_count:1,
      secondary_count:1,
      passive_count:1});
    RS.startSet(true, function(err, result) {      
      if(err != null) throw err;
      // Finish setup
      callback();      
    });      
  },
  
  tearDown: function(callback) {
    RS.restartKilledNodes(function(err, result) {
      callback();                
    });
  },

  shouldCorrectlyConncetToSSLBasedReplicaset : function(test) {
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      ], 
      {rs_name:RS.name, ssl:true}
    );
    
    // Connect to the replicaset
    var slaveDb = null;
    var db = new Db('foo', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    db.open(function(err, p_db) {
      test.equal(null, err);
      test.done();
      p_db.close();
    });
  },
    
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }    
})

// Assign out tests
module.exports = tests;
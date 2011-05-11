var testCase = require('nodeunit').testCase,
  debug = require('sys').debug
  inspect = require('sys').inspect,
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  Server = require('../../lib/mongodb').Server;

// Keep instance of ReplicaSetManager
var RS = null;

module.exports = testCase({
  setUp: function(callback) {
    // Create instance of replicaset manager
    RS = new ReplicaSetManager();
    RS.startSet(function(err, result) {      
      if(err != null) throw err;
      // Finish setup
      callback();      
    });
    // // Restart killed nodes
    // RS.restartKilledNodes(function(err, result) {
    //   // Finish setup
    //   callback();      
    // });
  },
  
  tearDown: function(callback) {
    // // Restart killed nodes
    // RS.restartKilledNodes(function(err, result) {
    //   // Finish setup
    //   callback();      
    // });
    callback();
  },
  
  shouldCorrectlyConnect: function(test) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );

    var db = new Db('connect_test', replSet );
    db.open( function ( err, p_db ) {
      // Test primary
      RS.primary(function(err, primary) {
        test.notEqual(null, primary);        
        test.equal(primary, p_db.serverConfig.primary.host + ":" + p_db.serverConfig.primary.port);

        // Perform tests
        RS.secondaries(function(err, items) {
          // Test if we have the right secondaries
          test.deepEqual(items.sort(), p_db.serverConfig.secondaries.map(function(item) {
                                          return item.host + ":" + item.port;
                                        }).sort());

          // Test if we have the right arbiters
          RS.arbiters(function(err, items) {
            test.deepEqual(items.sort(), p_db.serverConfig.arbiters.map(function(item) {
                                            return item.host + ":" + item.port;
                                          }).sort());

            test.done();
          });
        });
      })            
    });        
  }  
})
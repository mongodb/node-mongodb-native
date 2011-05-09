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
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );

    var db = new Db('connect_test', replSet );
    db.open( function ( err, p_db ) {
      debug("================================================================ db.open");
      debug("err:: " + inspect(err))
      debug("p_db:: " + inspect(p_db))      
      
      // Check
      
      

      test.done();
    });        
  }  
})
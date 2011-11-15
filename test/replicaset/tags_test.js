var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  Server = require('../../lib/mongodb').Server;

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
  // Print any errors
  db.on("error", function(err) {
    console.log("============================= ensureConnection caught error")
    console.dir(err)
    if(err != null && err.stack != null) console.log(err.stack)
    db.close();
  })
  
  // Open the db
  db.open(function(err, p_db) {    
    db.close();

    if(err != null) {
      // Wait for a sec and retry
      setTimeout(function() {
        numberOfTries = numberOfTries - 1;
        ensureConnection(test, numberOfTries, callback);
      }, 3000);
    } else {
      return callback(null);
    }    
  })            
}

module.exports = testCase({
  setUp: function(callback) {
    // Create instance of replicaset manager but only for the first call
    if(!serversUp && !noReplicasetStart) {
      serversUp = true;
      RS = new ReplicaSetManager({retries:120, passive_count:0, secondary_count:2, tags:[{"dc1":"ny"}, {"dc1":"ny"}, {"dc2":"sf"}]});
      RS.startSet(true, function(err, result) {    
        callback();      
      });      
    } else {
      RS.restartKilledNodes(function(err, result) {
        callback();        
      })
    }
  },
  
  tearDown: function(callback) {
    RS.restartKilledNodes(function(err, result) {
      callback();                
    });
  },

  // 'Should Correctly Connect With Default Replicaset And Insert Document For Tag Dc:NY' : function(test) {
  //   // Replica configuration
  //   var replSet = new ReplSetServers([ 
  //       new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
  //     ], 
  //     {}
  //   );
  // 
  //   var db = new Db('integration_test_', replSet);
  //   db.open(function(err, p_db) {
  //     // Recreate collection on replicaset
  //     p_db.createCollection('testsets', function(err, collection) {
  //       if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));  
  //       
  //       // Insert a dummy document
  //       collection.insert({a:20}, {safe: {w:'majority'}}, function(err, r) {            
  //         // Should have no error
  //         test.equal(null, err);
  //         
  //         // Do a read for the value
  //         collection.findOne({a:20}, function(err, item) {
  //           test.equal(20, item.a);
  //           test.done();
  //           p_db.close();
  //         })
  //       });
  //     });      
  //   })    
  // }, 
  // 
  // 'Should Honor setReadPreference primary' : function(test) {
  //   // Replica configuration
  //   var replSet = new ReplSetServers([ 
  //       new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
  //     ], 
  //     {}
  //   );
  //   
  //   // Set read preference
  //   replSet.setReadPreference(Server.READ_PRIMARY);
  //   // Open the database
  //   var db = new Db('integration_test_', replSet);
  //   db.open(function(err, p_db) {
  //     // Checkout a reader and make sure it's the primary
  //     var reader = replSet.checkoutReader();
  //     var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
  //     // Locate server instance associated with this id
  //     var serverInstance = replSet._state.addresses[readerAddress];      
  //     // Check that it's the primary instance
  //     test.equal(true, serverInstance.master);
  //     // Check that it's in the list of primary servers
  //     var primaryAddress = replSet._state.master.host + ":" + replSet._state.master.port;
  //     test.equal(primaryAddress, readerAddress);
  //     // End test and close db
  //     test.done();
  //     p_db.close();
  //   })    
  // }, 
  // 
  // 'Should Honor setReadPreference secondary' : function(test) {
  //   // Replica configuration
  //   var replSet = new ReplSetServers([ 
  //       new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
  //     ], 
  //     {}
  //   );
  //   
  //   // Set read preference
  //   replSet.setReadPreference(Server.READ_SECONDARY);
  //   // Open the database
  //   var db = new Db('integration_test_', replSet);
  //   db.open(function(err, p_db) {
  //     // Checkout a reader and make sure it's the primary
  //     var reader = replSet.checkoutReader();
  //     var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
  //     // Locate server instance associated with this id
  //     var serverInstance = replSet._state.addresses[readerAddress];      
  //     // Check that it's the primary instance
  //     test.equal(false, serverInstance.master);
  //     // Check that it's in the list of primary servers
  //     test.ok(replSet._state.secondaries[readerAddress] != null);
  //     // End test and close db
  //     test.done();
  //     p_db.close();
  //   })    
  // }, 
  // 
  // 'Should correctly cleanup connection with tags' : function(test) {
  //   // Replica configuration
  //   var replSet = new ReplSetServers([ 
  //       new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
  //     ], 
  //     {}
  //   );
  //   
  //   // Set read preference
  //   replSet.setReadPreference({'dc3':'pa', 'dc2':'sf', 'dc1':'ny'});
  //   // Open the database
  //   var db = new Db('integration_test_', replSet);
  //   db.open(function(err, p_db) {
  //     // Checkout a reader and make sure it's the primary
  //     var reader = replSet.checkoutWriter();
  //     var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
  //     // Locate server instance associated with this id
  //     var serverInstance = replSet._state.addresses[readerAddress];      
  //     // Force cleanup of byTags
  //     ReplSetServers._cleanupTags(serverInstance, replSet._state.byTags);
  //     // Check cleanup successful 
  //     test.equal(1, replSet._state.byTags['dc1']['ny'].length);
  //     test.equal(1, replSet._state.byTags['dc2']['sf'].length);
  //     // End test and close db
  //     test.done();
  //     p_db.close();
  //   })        
  // },
  // 
  // 'Should Honor setReadPreference tag' : function(test) {
  //   // Replica configuration
  //   var replSet = new ReplSetServers([ 
  //       new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
  //       new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
  //     ], 
  //     {}
  //   );
  //   
  //   // Set read preference
  //   replSet.setReadPreference({'dc3':'pa', 'dc2':'sf', 'dc1':'ny'});
  //   // Open the database
  //   var db = new Db('integration_test_', replSet);
  //   db.open(function(err, p_db) {
  //     // Checkout a reader and make sure it's the primary
  //     var reader = replSet.checkoutReader();
  //     var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
  //     // Locate server instance associated with this id
  //     var serverInstance = replSet._state.addresses[readerAddress];      
  //     test.deepEqual({ dc2: 'sf' }, serverInstance.tags)
  //     test.done();
  //     p_db.close();
  //   })    
  // },
  
  'Should Correctly Collect ping information from servers' : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {}
    );
    
    // Set read preference
    replSet.setReadPreference({'dc3':'pa', 'dc2':'sf', 'dc1':'ny'});
    // Open the database
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      setTimeout(function() {
        console.log("------------------------------------------------------- runtimeStats")
        console.dir(replSet._state.runtimeStats)
        
        test.done();
        p_db.close();        
      }, 5000)
    })    
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})

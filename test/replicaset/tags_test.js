var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  PingStrategy = require('../../lib/mongodb/connection/strategies/ping_strategy').PingStrategy,
  StatisticsStrategy = require('../../lib/mongodb/connection/strategies/statistics_strategy').StatisticsStrategy,
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
    // RS.restartKilledNodes(function(err, result) {
      callback();                
    // });
  },

  'Should Correctly Connect With Default Replicaset And Insert Document For Tag Dc:NY' : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {}
    );
  
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      // Recreate collection on replicaset
      p_db.createCollection('testsets', function(err, collection) {
        if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));  
        
        // Insert a dummy document
        collection.insert({a:20}, {safe: {w:'majority'}}, function(err, r) {            
          // Should have no error
          test.equal(null, err);
          
          // Do a read for the value
          collection.findOne({a:20}, function(err, item) {
            p_db.close();
            test.equal(20, item.a);
            test.done();
          })
        });
      });      
    })    
  }, 
  
  'Should Honor setReadPreference primary' : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {}
    );
    
    // Set read preference
    replSet.setReadPreference(Server.READ_PRIMARY);
    // Open the database
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      // Checkout a reader and make sure it's the primary
      var reader = replSet.checkoutReader();
      var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
      // Locate server instance associated with this id
      var serverInstance = replSet._state.addresses[readerAddress];      
      // Check that it's the primary instance
      test.equal(true, serverInstance.master);
      // Check that it's in the list of primary servers
      var primaryAddress = replSet._state.master.host + ":" + replSet._state.master.port;
      test.equal(primaryAddress, readerAddress);
      // End test and close db
      p_db.close();
      test.done();
    })    
  }, 
  
  'Should Honor setReadPreference secondary' : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {}
    );
    
    // Set read preference
    replSet.setReadPreference(Server.READ_SECONDARY);
    // Open the database
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      // Checkout a reader and make sure it's the primary
      var reader = replSet.checkoutReader();
      var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
      // Locate server instance associated with this id
      var serverInstance = replSet._state.addresses[readerAddress];      
      // Check that it's the primary instance
      test.equal(false, serverInstance.master);
      // Check that it's in the list of primary servers
      test.ok(replSet._state.secondaries[readerAddress] != null);
      // End test and close db
      p_db.close();
      test.done();
    })    
  }, 
  
  'Should correctly cleanup connection with tags' : function(test) {
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
      // Checkout a reader and make sure it's the primary
      var reader = replSet.checkoutWriter();
      var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
      // Locate server instance associated with this id
      var serverInstance = replSet._state.addresses[readerAddress];      
      // Force cleanup of byTags
      ReplSetServers._cleanupTags(serverInstance, replSet._state.byTags);
      // Check cleanup successful 
      test.equal(1, replSet._state.byTags['dc1']['ny'].length);
      test.equal(1, replSet._state.byTags['dc2']['sf'].length);
      // End test and close db
      p_db.close();
      test.done();
    })        
  },
  
  'Should Honor setReadPreference tag' : function(test) {
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
      // Checkout a reader and make sure it's the primary
      var reader = replSet.checkoutReader();
      var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
      // Locate server instance associated with this id
      var serverInstance = replSet._state.addresses[readerAddress];      
      test.deepEqual({ dc2: 'sf' }, serverInstance.tags)
      p_db.close();
      test.done();
    })    
  },
  
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
    var db = new Db('integration_test_', replSet, {recordQueryStats:true});
    db.open(function(err, p_db) {
      setTimeout(function() {
        var keys = Object.keys(replSet._state.addresses);
        for(var i = 0; i < keys.length; i++) {
          var server = replSet._state.addresses[keys[i]];
          test.ok(server.queryStats.numDataValues >= 0);
          test.ok(server.queryStats.mean >= 0);
          test.ok(server.queryStats.variance >= 0);
          test.ok(server.queryStats.standardDeviation >= 0);
        }
        
        p_db.close();        
        test.done();
      }, 5000)
    })    
  },
  
  'Should correctly pick a ping strategy for secondary' : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {}
    );
    
    // Set read preference
    replSet.setReadPreference(Server.READ_SECONDARY);
    // Open the database
    var db = new Db('integration_test_', replSet, {recordQueryStats:true});
    db.open(function(err, p_db) {
      p_db.createCollection('testsets3', function(err, collection) {
        if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));  
        
        // Insert a bunch of documents
        collection.insert([{a:20}, {b:30}, {c:40}, {d:50}], {safe: {w:'majority'}}, function(err, r) {            
          
          // Select all documents
          collection.find().toArray(function(err, items) {
            test.equal(null, err);
            test.equal(4, items.length);
            p_db.close();        
            test.done();
          });
        });
      });
    })    
  },
  
  'Should correctly pick a statistics strategy for secondary' : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {strategy:'statistical'}
    );
    
    // Ensure we have the right strategy
    test.ok(replSet.strategyInstance instanceof StatisticsStrategy);
    
    // Set read preference
    replSet.setReadPreference(Server.READ_SECONDARY);
    // Open the database
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      p_db.createCollection('testsets2', function(err, collection) {
        if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));  
        
        // Insert a bunch of documents
        collection.insert([{a:20}, {b:30}, {c:40}, {d:50}], {safe: {w:'majority'}}, function(err, r) {            
          
          // Select all documents
          collection.find().toArray(function(err, items) {
            collection.find().toArray(function(err, items) {
              collection.find().toArray(function(err, items) {
                test.equal(null, err);
                test.equal(4, items.length);
                
                // Total number of entries done
                var totalNumberOfStrategyEntries = 0;
            
                // Check that we have correct strategy objects
                var keys = Object.keys(replSet._state.secondaries);
                for(var i = 0; i < keys.length; i++) {
                  var server = replSet._state.secondaries[keys[i]];
                  totalNumberOfStrategyEntries += server.queryStats.numDataValues;
                }
            
                p_db.close();        
                test.equal(4, totalNumberOfStrategyEntries);
                test.done();
              });
            });
          });
        });
      });
    })    
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})

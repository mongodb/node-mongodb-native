var format = require('util').format;

// exports['Should Correctly Checkout Readers'] = function(configuration, test) {
//   var mongo = configuration.getMongoPackage()
//     , ReadPreference = mongo.ReadPreference;

//   var db = configuration.db();

//   /**
//    * Read using PRIMARY
//    **/

//   var connection = db.serverConfig.checkoutReader(ReadPreference.PRIMARY);
//   // Locate connection
//   test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));

//   /**
//    * Read using PRIMARY_PREFERRED
//    **/

//   //
//   // Read using PRIMARY_PREFERRED, pick the primary
//   connection = db.serverConfig.checkoutReader(ReadPreference.PRIMARY_PREFERRED);
//   // Locate connection
//   test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));

//   //
//   // Remove the access to the primary
//   var master = db.serverConfig._state.master;
//   db.serverConfig._state.master = null;

//   //
//   // Read from secondary when primary not available
//   connection = db.serverConfig.checkoutReader(ReadPreference.PRIMARY_PREFERRED);

//   // Build a list of all secondary connections
//   var keys = Object.keys(db.serverConfig._state.secondaries);
//   var connections = [];

//   for(var i = 0; i < keys.length; i++) {
//     connections = connections.concat(db.serverConfig._state.secondaries[keys[i]].allRawConnections());
//   }

//   // Locate connection
//   test.ok(locateConnection(connection, connections));

//   // Clean up
//   db.serverConfig._state.master = master;

//   /**
//    * Read using SECONDARY
//    **/

//   // Read with secondaries available
//   connection = db.serverConfig.checkoutReader(ReadPreference.SECONDARY);

//   // Locate connection
//   test.ok(locateConnection(connection, connections));

//   //
//   // Remove the secondaries, we should now fail
//   var secondaries = db.serverConfig._state.secondaries;
//   db.serverConfig._state.secondaries = {};

//   // Read with no secondaries available
//   connection = db.serverConfig.checkoutReader(ReadPreference.SECONDARY);
//   // No connection should be found
//   test.equal("No replica set secondary available for query with ReadPreference SECONDARY", connection.message);

//   // Return the set to the correct state
//   db.serverConfig._state.secondaries = secondaries;

//   /**
//    * Read using SECONDARY_PREFERRED
//    **/

//   // Read with secondaries available
//   connection = db.serverConfig.checkoutReader(ReadPreference.SECONDARY_PREFERRED);
//   // Locate connection
//   test.ok(locateConnection(connection, connections));

//   //
//   // Remove the secondaries, we should now return the primary
//   var secondaries = db.serverConfig._state.secondaries;
//   db.serverConfig._state.secondaries = {};

//   // Read with secondaries available
//   connection = db.serverConfig.checkoutReader(ReadPreference.SECONDARY_PREFERRED);

//   // Locate connection
//   test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));

//   // Return the set to the correct state
//   db.serverConfig._state.secondaries = secondaries;

//   // Finish up test
//   test.done();
// }

// exports['Should Correctly Use ReadPreference.NEAREST read preference'] = function(configuration, test) {
//   var mongo = configuration.getMongoPackage()
//     , ReadPreference = mongo.ReadPreference;

//   var db = configuration.db();
//   // Wait for a bit, let ping happen
//   setTimeout(function() {
//     // Fetch my nearest
//     var connection = db.serverConfig.checkoutReader(ReadPreference.NEAREST);

//     // All candidate servers
//     var candidateServers = [];

//     // Add all secondaries
//     var keys = Object.keys(db.serverConfig._state.secondaries);
//     for(var i = 0; i < keys.length; i++) {
//       candidateServers.push(db.serverConfig._state.secondaries[keys[i]]);
//     }

//     // Sort by ping time
//     candidateServers.sort(function(a, b) {
//       return a.runtimeStats['pingMs'] > b.runtimeStats['pingMs'];
//     });

//     // Get all the connections
//     var connections = candidateServers[0].allRawConnections();

//     // verify that we have picked the lowest connection
//     test.ok(locateConnection(connection, connections));

//     // Should not be null
//     test.ok(connection != null);

//     //
//     // Remove the access to the primary
//     var master = db.serverConfig._state.master;
//     db.serverConfig._state.master = null;

//     // Fetch a secondary
//     connection = db.serverConfig.checkoutReader(ReadPreference.NEAREST);

//     // All candidate servers
//     var candidateServers = [];

//     // Add all secondaries
//     var keys = Object.keys(db.serverConfig._state.secondaries);
//     for(var i = 0; i < keys.length; i++) {
//       candidateServers.push(db.serverConfig._state.secondaries[keys[i]]);
//     }

//     // Sort by ping time
//     candidateServers.sort(function(a, b) {
//       return a.runtimeStats['pingMs'] > b.runtimeStats['pingMs'];
//     });

//     // Get all the connections
//     var connections = candidateServers[0].allRawConnections();

//     // verify that we have picked the lowest connection
//     test.ok(locateConnection(connection, connections));

//     // Locate connection
//     test.ok(locateConnection(connection, connections));

//     // Clean up
//     db.serverConfig._state.master = master;

//     // Finish up test
//     test.done();
//     db.close();
//   }, 5000);
// }

// exports['Should Correctly Use Preferences by tags no strategy'] = function(configuration, test) {
//   var mongo = configuration.getMongoPackage()
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSetServers = mongo.ReplSetServers
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSetServers([
//       new Server(replicasetManager.host, replicasetManager.ports[0]),
//       new Server(replicasetManager.host, replicasetManager.ports[1]),
//       new Server(replicasetManager.host, replicasetManager.ports[2])
//     ]);

//   // Open the database
//   var db = new Db('integration_test_', replSet, {w:0, recordQueryStats:true});
//   // Trigger test once whole set is up
//   db.on("fullsetup", function() {
//     // Wait for a bit, let ping happen
//     setTimeout(function() {
//       /**
//        * Read using PRIMARY
//        **/

//       var connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.PRIMARY, {"dc1":"ny"}));
//       // Validate the error
//       test.ok(connection instanceof Error);
//       test.equal("PRIMARY cannot be combined with tags", connection.message);

//       /**
//        * Read using PRIMARY_PREFERRED
//        **/

//       //
//       // Read using PRIMARY_PREFERRED, pick the primary
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.PRIMARY_PREFERRED, {"dc1":"ny"}));
//       // Locate connection
//       test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));

//       //
//       // Remove the access to the primary
//       var master = db.serverConfig._state.master;
//       db.serverConfig._state.master = null;

//       //
//       // Read from secondary when primary not available
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.PRIMARY_PREFERRED, {"dc2":"sf"}));

//       // Build a list of all secondary connections
//       var keys = Object.keys(db.serverConfig._state.secondaries);
//       var connections = [];

//       for(var i = 0; i < keys.length; i++) {
//         if(db.serverConfig._state.secondaries[keys[i]].tags["dc2"] == "sf") {
//           connections = connections.concat(db.serverConfig._state.secondaries[keys[i]].allRawConnections());
//         }
//       }

//       // Locate connection
//       test.ok(locateConnection(connection, connections));

//       //
//       // Read from secondary when primary not available
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.PRIMARY_PREFERRED, {"dc3":"sf"}));

//       // Validate the error
//       test.ok(connection instanceof Error);
//       test.equal("No replica set members available for query", connection.message);

//       // Clean up
//       db.serverConfig._state.master = master;

//       /**
//        * Read using SECONDARY
//        **/

//       // Read with secondaries available
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.SECONDARY, {"dc2":"sf"}));
//       // Locate connection
//       test.ok(locateConnection(connection, connections));

//       //
//       // Remove the secondaries, we should now fail
//       var secondaries = db.serverConfig._state.secondaries;
//       db.serverConfig._state.secondaries = {};

//       // Read with no secondaries available and tag preferences
//       connection = db.serverConfig.checkoutReader(ReadPreference.SECONDARY, {"dc2":"sf"});
//       test.equal("No replica set member available for query with ReadPreference secondary and tags {\"dc2\":\"sf\"}", connection.message);

//       // Read with no secondaries available and no tags
//       connection = db.serverConfig.checkoutReader(ReadPreference.SECONDARY);
//       test.equal("No replica set secondary available for query with ReadPreference SECONDARY", connection.message);

//       // Return the set to the correct state
//       db.serverConfig._state.secondaries = secondaries;

//       /**
//        * Read using SECONDARY_PREFERRED
//        **/

//       // Read with secondaries available
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.SECONDARY_PREFERRED, [{"nothing":"done"}, {"dc2":"sf"}]));
//       // Locate connection
//       test.ok(locateConnection(connection, connections));

//       //
//       // Remove the secondaries, we should now return the primary
//       var secondaries = db.serverConfig._state.secondaries;
//       db.serverConfig._state.secondaries = {};

//       // Read with secondaries available
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.SECONDARY_PREFERRED, {"dc2":"sf"}));

//       // Locate connection
//       test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));

//       // Return the set to the correct state
//       db.serverConfig._state.secondaries = secondaries;

//       // Finish up test
//       test.done();
//       db.close();
//     }, 5000);
//   });

//   db.open(function(err, p_db) {
//     db = p_db;
//   })
// }

// exports['Should Correctly Use ReadPreference.NEAREST read preference with tags'] = function(configuration, test) {
//   var mongo = configuration.getMongoPackage()
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSetServers = mongo.ReplSetServers
//     , Server = mongo.Server
//     , Db = mongo.Db;
//   var db = configuration.db();

//   // Wait for a bit, let ping happen
//   setTimeout(function() {
//     // Fetch my nearest
//     var connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc2":"sf"}));

//     // Build a list of all secondary connections
//     var keys = Object.keys(db.serverConfig._state.secondaries);
//     var connections = [];

//     for(var i = 0; i < keys.length; i++) {
//       if(db.serverConfig._state.secondaries[keys[i]].tags["dc2"] == "sf") {
//         connections = connections.concat(db.serverConfig._state.secondaries[keys[i]].allRawConnections());
//       }
//     }

//     // verify that we have picked the lowest connection correctly taged server
//     test.ok(locateConnection(connection, connections));

//     // Pick out of two nearest servers
//     connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc1":"ny"}));

//     // All candidate servers
//     var candidateServers = [];

//     // Build a list of all secondary connections
//     keys = Object.keys(db.serverConfig._state.secondaries);
//     connections = [];

//     for(var i = 0; i < keys.length; i++) {
//       if(db.serverConfig._state.secondaries[keys[i]].tags["dc1"] == "ny") {
//         candidateServers.push(db.serverConfig._state.secondaries[keys[i]]);
//       }
//     }

//     // Sort by ping time
//     candidateServers.sort(function(a, b) {
//       return a.runtimeStats['pingMs'] > b.runtimeStats['pingMs'];
//     });

//     // Get all the connections
//     connections = candidateServers[0].allRawConnections();
//     // verify that we have picked the lowest connection correctly taged server
//     test.ok(locateConnection(connection, connections));

//     // No server available
//     connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc5":"ny"}));

//     // Validate no connection available
//     test.equal("No replica set members available for query", connection.message);

//     var strategyInstance = db.serverConfig.strategyInstance;

//     // Error if no strategy instance
//     db.serverConfig.strategyInstance = null;

//     // No server available
//     connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc5":"ny"}));
//     test.equal("A strategy for calculating nearness must be enabled such as ping or statistical", connection.message);

//     db.serverConfig.strategyInstance = strategyInstance;
//     // Finish up test
//     test.done();
//   }, 5000);
// }

// exports['Should Correctly Use ReadPreference.NEAREST read preference with tags and statistical strategy'] = function(configuration, test) {
//   var mongo = configuration.getMongoPackage()
//     , MongoClient = mongo.MongoClient
//     , ReadPreference = mongo.ReadPreference
//     , ReplSetServers = mongo.ReplSetServers
//     , Server = mongo.Server
//     , Db = mongo.Db;

//   var replicasetManager = configuration.getReplicasetManager();

//   // Replica configuration
//   var replSet = new ReplSetServers([
//       new Server(replicasetManager.host, replicasetManager.ports[0]),
//       new Server(replicasetManager.host, replicasetManager.ports[1]),
//       new Server(replicasetManager.host, replicasetManager.ports[2])
//     ],
//     {strategy:'statistical'}
//   );

//   // Open the database
//   var db = new Db('integration_test_', replSet, {w:0, recordQueryStats:true});
//   // Trigger test once whole set is up
//   db.on("fullsetup", function() {
//     // Wait for a bit, let ping happen
//     setTimeout(function() {
//       // Fetch my nearest
//       var connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc2":"sf"}));

//       // Build a list of all secondary connections
//       var keys = Object.keys(db.serverConfig._state.secondaries);
//       var connections = [];

//       for(var i = 0; i < keys.length; i++) {
//         if(db.serverConfig._state.secondaries[keys[i]].tags["dc2"] == "sf") {
//           connections = connections.concat(db.serverConfig._state.secondaries[keys[i]].allRawConnections());
//         }
//       }

//       // verify that we have picked the lowest connection correctly taged server
//       test.ok(locateConnection(connection, connections));

//       // Pick out of two nearest servers
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc1":"ny"}));

//       // All candidate servers
//       var candidateServers = [];

//       // Build a list of all secondary connections
//       keys = Object.keys(db.serverConfig._state.secondaries);
//       connections = [];

//       for(var i = 0; i < keys.length; i++) {
//         if(db.serverConfig._state.secondaries[keys[i]].tags["dc1"] == "ny") {
//           candidateServers.push(db.serverConfig._state.secondaries[keys[i]]);
//         }
//       }

//       // Sort by ping time
//       candidateServers.sort(function(a, b) {
//         return a.runtimeStats['pingMs'] > b.runtimeStats['pingMs'];
//       });

//       // Get all the connections
//       connections = candidateServers[0].allRawConnections();
//       // verify that we have picked the lowest connection correctly taged server
//       test.ok(locateConnection(connection, connections));

//       // No server available
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc5":"ny"}));

//       // Validate no connection available
//       test.equal("No replica set members available for query", connection.message);

//       // Error if no strategy instance
//       db.serverConfig.strategyInstance = null;

//       // No server available
//       connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST, {"dc5":"ny"}));
//       test.equal("A strategy for calculating nearness must be enabled such as ping or statistical", connection.message);

//       // Finish up test
//       db.close();
//       test.done();
//     }, 5000);
//   });

//   db.open(function(err, p_db) {
//     db = p_db;
//   })
// }

exports['Should Correctly Pick lowest ping time'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers([
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {strategy:'ping', secondaryAcceptableLatencyMS: 5}
  );

  // Open the database
  var db = new Db('integration_test_', replSet
    , {w:0, recordQueryStats:true, logger: {
      debug: function(message, object) {
        // console.log(format("[DEBUG] %s with tags %o", message, object))
      },
      log: function(message, object) {

      },
      error: function(message, object) {

      }
    }}
  );

  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    var time = 10;
    // Set the ping times
    var keys = Object.keys(db.serverConfig._state.secondaries);
    for(var i = 0; i < keys.length; i++) {
      var key = keys[i];
      db.serverConfig._state.secondaries[key].runtimeStats['pingMs'] = time;
      time += 10;
    }
    
    // Set primary pingMs
    db.serverConfig._state.master.runtimeStats['pingMs'] = time;

    // No server available
    var connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST));
    // Should match the first secondary server
    var matching_server = db.serverConfig._state.secondaries[keys[0]];
    // Host and port should match
    test.equal(matching_server.host, connection.socketOptions.host);
    test.equal(matching_server.port, connection.socketOptions.port);

    // No server available
    connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.SECONDARY));
    // Should match the first secondary server
    var matching_server = db.serverConfig._state.secondaries[keys[0]];
    // Host and port should match
    test.equal(matching_server.host, connection.socketOptions.host);
    test.equal(matching_server.port, connection.socketOptions.port);

    // No server available
    connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.SECONDARY_PREFERRED));
    // Should match the first secondary server
    var matching_server = db.serverConfig._state.secondaries[keys[0]];
    // Host and port should match
    test.equal(matching_server.host, connection.socketOptions.host);
    test.equal(matching_server.port, connection.socketOptions.port);

    // No server available
    connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.PRIMARY));
    // Should match the first secondary server
    var matching_server = db.serverConfig._state.master;
    // Host and port should match
    test.equal(matching_server.host, connection.socketOptions.host);
    test.equal(matching_server.port, connection.socketOptions.port);

    // Set high secondaryAcceptableLatencyMS and ensure both secondaries get picked
    replSet.strategyInstance.secondaryAcceptableLatencyMS = 500;
    var selectedServers = {};

    while(Object.keys(selectedServers).length != 2) {
      connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.SECONDARY));      
      selectedServers[connection.socketOptions.port] = true;
    }

    var selectedServers = {};

    while(Object.keys(selectedServers).length != 2) {
      connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.SECONDARY_PREFERRED));
      selectedServers[connection.socketOptions.port] = true;
    }

    var selectedServers = {};

    while(Object.keys(selectedServers).length != 3) {
      connection = db.serverConfig.checkoutReader(new ReadPreference(ReadPreference.NEAREST));
      selectedServers[connection.socketOptions.port] = true;
    }

    // Finish up test
    test.done();
    db.close();
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
}

var locateConnection = function(connection, connections) {
  // Locate one
  for(var i = 0; i < connections.length; i++) {
    if(connections[i].id == connection.id) {
      return true;
    }
  }

  return false;
}

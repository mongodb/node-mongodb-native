var format = require('util').format
  , fs = require('fs');

exports['Should Correctly Use Secondary Server with Query when using NEAREST'] = function(configuration, test) {
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
    {readPreference: ReadPreference.NEAREST, rs_name:replicasetManager.name}
  );

  // Open the database
  var db = new Db('integration_test_', replSet, {w:1});
  db.open(function(err, db) {
    // Force selection of a secondary
    db.serverConfig._state.master.runtimeStats['pingMs'] = 5000;
    // Check that we get a secondary
    var connection = db.serverConfig.checkoutReader();
    var keys = Object.keys(db.serverConfig._state.secondaries);
    var found = false;

    // Execute a query
    db.collection('nearest_collection_test').insert({a:1}, {w:3, wtimeout:10000}, function(err, doc) {
      test.equal(null, err);    

      db.collection('nearest_collection_test').findOne({a:1}, function(err, doc) {
        test.equal(null, err);
        test.equal(1, doc.a);

        db.close();
        test.done();
      });
    });
  });
}

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
    {strategy:'ping', secondaryAcceptableLatencyMS: 5, rs_name:replicasetManager.name}
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
    // console.log(matching_server.host + "=" + connection.socketOptions.host)
    // console.log(matching_server.port + "=" + connection.socketOptions.port)

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

exports['Should Correctly Vary read server when using readpreference NEAREST'] = function(configuration, test) {
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
    {readPreference: ReadPreference.NEAREST, rs_name:replicasetManager.name}
  );

  // Open the database
  var db = new Db('integration_test_', replSet, {w:1});
  db.open(function(err, db) {
    // Check that we are getting different servers
    var connection = db.serverConfig.checkoutReader();
    var port = connection.socketOptions.port;
    connection = db.serverConfig.checkoutReader();
    test.ok(port != connection.socketOptions.port);

    // Execute a query
    db.collection('nearest_collection_test').insert({a:1}, {w:3, wtimeout:10000}, function(err, doc) {
      test.equal(null, err);    

      db.collection('nearest_collection_test').findOne({a:1}, function(err, doc) {
        test.equal(null, err);
        test.equal(1, doc.a);

        db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadFromGridstoreWithSecondaryReadPreference = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID
    , ReadPreference = configuration.getMongoPackage().ReadPreference;
  var client = configuration.db();
  var gridStore = new GridStore(client, null, 'w', {w:3});

  // Force multiple chunks to be stored
  gridStore.chunkSize = 5000;
  var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
  var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

  gridStore.open(function(err, gridStore) {

    // Write the file using write
    gridStore.write(data, function(err, doc) {
      gridStore.close(function(err, doc) {

        // Save checkout function
        var checkout = client.serverConfig.checkoutReader;
        // // Set up our checker method
        client.serverConfig.checkoutReader = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          test.equal(ReadPreference.SECONDARY, args[0]);
          return checkout.apply(client.serverConfig, args);
        }

        // Read the file using readBuffer
        new GridStore(client, doc._id, 'r', {readPreference:ReadPreference.SECONDARY}).open(function(err, gridStore) {
          gridStore.read(function(err, data2) {
            test.equal(data.toString('base64'), data2.toString('base64'));
            client.serverConfig.checkoutReader = checkout;

            test.done();
          })
        });
      });
    })
  });
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

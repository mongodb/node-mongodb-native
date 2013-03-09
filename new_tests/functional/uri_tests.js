/**
 * A basic example using the MongoClient to connect using a Server instance, similar to existing Db version
 *
 * @_class mongoclient
 * @_function open
 */
exports['Should correctly connect using MongoClient to a single server'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;
  // Set up the connection to the local db
  var mongoclient = new MongoClient(new Server("localhost", 27017, {native_parser: true}));

  // Open the connection to the server
  mongoclient.open(function(err, mongoclient) {

    // Get the first db and do an update document on it
    var db = mongoclient.db("integration_tests");
    db.collection('mongoclient_test').update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      // Get another db and do an update document on it
      var db2 = mongoclient.db("integration_tests2");
      db2.collection('mongoclient_test').update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);

        // Close the connection
        mongoclient.close();
        test.done();
      });
    });
  });
}

/**
 * Example of a simple url connection string for a single server connection
 *
 * @_class mongoclient
 * @_function MongoClient.connect
 */
exports['Should correctly connect using MongoClient to a single server using connect'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;
  // Connect using the connection string  
  MongoClient.connect("mongodb://localhost:27017/integration_tests", {native_parser:true}, function(err, db) {
    test.equal(null, err);

    db.collection('mongoclient_test').update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly connect using MongoClient to a single server using connect with optional server setting'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;
  // Connect using the connection string  
  MongoClient.connect("mongodb://localhost:27017/integration_tests", {
    db: {
      native_parser: false
    },

    server: {
      socketOptions: {
        connectTimeoutMS: 500
      }
    }
  }, function(err, db) {
    test.equal(null, err);
    test.equal(500, db.serverConfig.socketOptions.connectTimeoutMS);
    test.equal(false, db.native_parser);

    db.collection('mongoclient_test').update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly allow for w:0 overriding on the connect url'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;
  // Connect using the connection string  
  MongoClient.connect("mongodb://localhost:27017/integration_tests?w=0", function(err, db) {
    test.equal(null, err);

    db.collection('mongoclient_test').update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(null, result);

      db.close();
      test.done();
    });
  });
}
/**
 * A basic example using the MongoClient to connect using a Server instance, similar to existing Db version
 *
 * @_class mongoclient
 * @_function open
 */
exports['Should correctly connect using MongoClient to a single server'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;
  // DOC_START
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
  // DOC_END
}

/**
 * Example of a simple url connection string for a single server connection
 *
 * @_class mongoclient
 * @_function MongoClient.connect
 */
exports['Should correctly connect using MongoClient to a single server using connect'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;
  // DOC_START
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
  // DOC_END
}

/**
 * @ignore
 */
exports['Should correctly connect using MongoClient to a single server using connect with optional server setting'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
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
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
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

exports['Should correctly connect via domain socket'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var Db = configuration.getMongoPackage().Db;

  if(process.platform != "win32") {
    Db.connect("mongodb:///tmp/mongodb-27017.sock?safe=false", function(err, db) {
      test.equal(null, err);
      db.close();
      test.done();
    });
  } else { 
    test.done();
  }
}

exports['Should correctly connect via normal url using connect'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var mongodb = configuration.getMongoPackage();

  mongodb.connect("mongodb://localhost?safe=false", function(err, db) {
    test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url using require'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  require('../../../lib/mongodb')("mongodb://localhost?safe=false", function(err, db) {
    test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url A'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var Db = configuration.getMongoPackage().Db;

  Db.connect("mongodb://localhost?safe=false", function(err, db) {
    test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url B'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var Db = configuration.getMongoPackage().Db;

  Db.connect("mongodb://localhost?journal=true", function(err, db) {
    // test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url C'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var Db = configuration.getMongoPackage().Db;

  Db.connect("mongodb://localhost?journal=true", function(err, db) {
    test.deepEqual({j:true}, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url using ip'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var Db = configuration.getMongoPackage().Db;

  Db.connect("mongodb://127.0.0.1:27017?fsync=true", function(err, db) {
    test.deepEqual({fsync:true}, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url setting up poolsize of 1'] = function(configuration, test) {
  if(configuration.db().serverConfig instanceof configuration.getMongoPackage().ReplSet) return test.done();
  var Db = configuration.getMongoPackage().Db;

  Db.connect("mongodb://127.0.0.1:27017?maxPoolSize=1", function(err, db) {
    test.deepEqual(1, db.serverConfig.poolSize);
    test.equal('admin', db.databaseName);
    db.close();
    test.done();
  });
}

exports['Should correctly connect using uri encoded username and password'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;
  MongoClient.connect("mongodb://localhost:27017/integration_tests", {native_parser:true}, function(err, db) {
    test.equal(null, err);
    var user = 'u$ser'
      , pass = '$specialch@rs'
      ;

    db.addUser(user, pass, function(err) {
      test.equal(null, err);
      var uri = "mongodb://" + encodeURIComponent(user) + ":" + encodeURIComponent(pass) + "@localhost:27017/integration_tests";
      MongoClient.connect(uri, {uri_decode_auth: true, native_parser:true}, function(err, authenticatedDb) {
        test.equal(null, err);

        db.close();
        authenticatedDb.close();
        test.done();
      });
    });
  });
}

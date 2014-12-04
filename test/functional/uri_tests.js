"use strict";

/**
 * @ignore
 */
exports['Should correctly connect using MongoClient to a single server using connect with optional server setting'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;
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
}

/**
 * @ignore
 */
exports['Should correctly allow for w:0 overriding on the connect url'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;
    // Connect using the connection string  
    MongoClient.connect("mongodb://localhost:27017/integration_tests?w=0", function(err, db) {
      test.equal(null, err);

      db.collection('mongoclient_test').update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);

        if(result) test.equal(1, result.result.ok);
        else test.equal(null, result);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly connect via domain socket'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    if(process.platform != "win32") {
      MongoClient.connect("mongodb:///tmp/mongodb-27017.sock?safe=false", function(err, db) {
        test.equal(null, err);
        db.close();
        test.done();
      });
    } else { 
      test.done();
    }
  }
}

exports['Should correctly connect via normal url using connect'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var mongodb = configuration.require;

    mongodb.connect("mongodb://localhost?safe=false", function(err, db) {
      db.close();
      test.done();
    });
  }
}

exports['Should correctly connect via normal url using require'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    require('../..')("mongodb://localhost", function(err, db) {
      db.close();
      test.done();
    });
  }
}

exports['Should correctly connect via normal url journal option'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    MongoClient.connect("mongodb://localhost?journal=true", function(err, db) {
      test.deepEqual({j:true}, db.safe);
      db.close();
      test.done();
    });
  }
}

exports['Should correctly connect via normal url using ip'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    MongoClient.connect("mongodb://127.0.0.1:27017?fsync=true", function(err, db) {
      test.deepEqual({fsync:true}, db.safe);
      db.close();
      test.done();
    });
  }
}

exports['Should correctly connect via normal url setting up poolsize of 1'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    MongoClient.connect("mongodb://127.0.0.1:27017?maxPoolSize=1", function(err, db) {
      test.deepEqual(1, db.serverConfig.poolSize);
      test.equal('admin', db.databaseName);
      db.close();
      test.done();
    });
  }
}

exports['Should correctly connect using uri encoded username and password'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
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
}

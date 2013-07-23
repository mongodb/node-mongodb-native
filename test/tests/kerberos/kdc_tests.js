var format = require('util').format;

// You need to set up the kinit tab first
// kinit dev1@10GEN.ME
// password: (not shown)

/**
 * @ignore
 */
exports['Should Correctly Authenticate using kerberos with MongoClient'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s@%s/test?authMechanism=GSSAPI&gssapiServiceName=mongodb&maxPoolSize=1", urlEncodedPrincipal, server), function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Attempt an operation
    db.admin().command({listDatabases:1}, function(err, docs) {
      test.equal(null, err);
      test.ok(docs.documents[0].databases);

      db.db('admin').collection('system.users').find().toArray(function(err, users) {
        test.equal(null, err);
        test.ok(users != null);
        db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly Authenticate using kerberos with MongoClient and then reconnect'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s@%s/test?authMechanism=GSSAPI&maxPoolSize=5", urlEncodedPrincipal, server), function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Attempt an operation
    db.admin().command({listDatabases:1}, function(err, docs) {
      test.equal(null, err);
      test.ok(docs.documents[0].databases);

      // Close the connection
      // db.close();
      db.serverConfig.connectionPool.openConnections[0].connection.destroy();

      setTimeout(function() {
        // Attempt an operation
        db.admin().command({listDatabases:1}, function(err, docs) {
          test.equal(null, err);
          test.ok(docs.documents[0].databases);

          db.close();
          test.done();
        });
      }, 1000);
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly Authenticate authenticate method manually'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  var db = new Db('test', new Server('kdc.10gen.me', 27017), {w:1});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Authenticate
    db.authenticate(principal, null, {authMechanism: 'GSSAPI'}, function(err, result) {
      test.equal(null, err);
      test.ok(result);

      db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should Fail to Authenticate due to illegal service name'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s@%s/test?authMechanism=GSSAPI&gssapiServiceName=mongodb2&maxPoolSize=1", urlEncodedPrincipal, server), function(err, db) {
    test.ok(err != null);
    test.done();
  });
}

var format = require('util').format;

// You need to set up the kinit tab first
// kinit dev1@10GEN.ME
// password: (not shown)

/**
 * @ignore
 */
exports['Should Correctly Authenticate on Win32 using kerberos with MongoClient'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var pass = "a";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s:%s@%s/test?authMechanism=GSSAPI&maxPoolSize=1", urlEncodedPrincipal, pass, server), function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Attempt an operation
    db.admin().command({listDatabases:1}, function(err, docs) {
      test.equal(null, err);
      test.ok(docs.documents[0].databases);

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
  var pass = "a";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s:%s@%s/test?authMechanism=GSSAPI&gssapiServiceName=mongodb2&maxPoolSize=1", urlEncodedPrincipal, pass, server), function(err, db) {
    test.ok(err != null);
    test.done();
  });
}

/**
 * @ignore
 */
exports['Should Correctly Authenticate using kerberos on Win32 with MongoClient and then reconnect'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var pass = "a";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s:%s@%s/test?authMechanism=GSSAPI&maxPoolSize=5", urlEncodedPrincipal, pass, server), function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Close the connection
    db.close();

    // Attempt an operation
    db.admin().command({listDatabases:1}, function(err, docs) {
      test.equal(null, err);
      test.ok(docs.documents[0].databases);

      db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly Authenticate on Win32 authenticate method manually'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var urlEncodedPrincipal = encodeURIComponent(principal);
  var pass = "a";

  var db = new Db('test', new Server('kdc.10gen.me', 27017), {w:1});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Authenticate
    db.authenticate(principal, pass, {authMechanism: 'GSSAPI'}, function(err, result) {
      test.equal(null, err);
      test.ok(result);

      db.close();
      test.done();
    });
  });
}
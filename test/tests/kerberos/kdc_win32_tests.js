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
  var server = "ldaptest.10gen.cc";
  var principal = "drivers@LDAPTEST.10GEN.CC";
  var pass = process.env['LDAPTEST_PASSWORD'];
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s:%s@%s/test?authMechanism=GSSAPI&maxPoolSize=1", urlEncodedPrincipal, pass, server), function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    db.collection('test').find().toArray(function(err, docs) {
      test.equal(null, err);
      test.ok(true, docs[0].kerberos);
      test.done();
    });
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
  var server = "ldaptest.10gen.cc";
  var principal = "drivers@LDAPTEST.10GEN.CC";
  var pass = process.env['LDAPTEST_PASSWORD'];
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s:%s@%s/test?authMechanism=GSSAPI&maxPoolSize=5", urlEncodedPrincipal, pass, server), function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Find the docs
    db.collection('test').find().toArray(function(err, docs) {
      test.equal(null, err);
      test.ok(true, docs[0].kerberos);

      // Close the connection
      // db.close();
      db.serverConfig.connectionPool.openConnections[0].connection.destroy();

      setTimeout(function() {
        // Find the docs
        db.collection('test').find().toArray(function(err, docs) {
          test.equal(null, err);
          test.ok(true, docs[0].kerberos);

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
exports['Should Correctly Authenticate on Win32 authenticate method manually'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "ldaptest.10gen.cc";
  var principal = "drivers@LDAPTEST.10GEN.CC";
  var pass = process.env['LDAPTEST_PASSWORD'];
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
  var server = "ldaptest.10gen.cc";
  var principal = "drivers@LDAPTEST.10GEN.CC";
  var pass = process.env['LDAPTEST_PASSWORD'];
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s:%s@%s/test?authMechanism=GSSAPI&gssapiServiceName=mongodb2&maxPoolSize=1", urlEncodedPrincipal, pass, server), function(err, db) {
    test.ok(err != null);
    test.done();
  });
}

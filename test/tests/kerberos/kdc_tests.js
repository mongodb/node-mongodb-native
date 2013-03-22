var format = require('util').format;

/**
 * @ignore
 */
exports['Should Correctly Authenticate using different user source database and MongoClient'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // You need to set up the kinit tab first
  // kinit dev1@10GEN.ME
  // password: (not shown)

  // KDC Server
  var server = "kdc.10gen.me";
  var principal = "dev1@10GEN.ME";
  var urlEncodedPrincipal = encodeURIComponent(principal);

  // Let's write the actual connection code
  MongoClient.connect(format("mongodb://%s@%s/test?authMechanism=GSSAPI&maxPoolSize=1", urlEncodedPrincipal, server), function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Attempt an operation
    db.admin().command({listDatabases:1}, function(err, docs) {
      test.equal(null, err);
      console.log("+++++++++++++++++++++++++++++++++++++++++++");
      console.dir(err);
      console.dir(docs.documents[0].databases)
      test.equal(null, err);
      test.ok(docs.documents[0].databases);

      db.close();
      test.done();
    });

    // console.log("+++++++++++++++++++++++++++++++++++++++++++");
    // console.dir(err);
    // console.dir(db)
    // db.close();
    // test.done();
  });
}
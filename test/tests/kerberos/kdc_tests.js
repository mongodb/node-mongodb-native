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
    console.log("+++++++++++++++++++++++++++++++++++++++++++");
    console.dir(err);
    console.dir(db)
    test.done();
  });
}
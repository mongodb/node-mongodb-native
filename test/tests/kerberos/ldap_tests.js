var format = require('util').format;

/**
 * @ignore
 */
exports['Should correctly authenticate against ldap'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // KDC Server
  var server = "kdc.10gen.me";
  var user = "a";
  var pass = "a";

  // Url
  var url = format("mongodb://%s:%s@%s/test?authMechanism=PLAIN&maxPoolSize=1", user, pass, server);

  // Let's write the actual connection code
  MongoClient.connect(url, function(err, db) {
    test.equal(null, err);    

    // Attempt an operation
    db.command({connectionStatus:1}, function(err, docs) {
      test.equal(null, err);
      var valid = false;

      for(var i = 0; i < docs.authInfo.authenticatedUsers.length; i++) {
        if(docs.authInfo.authenticatedUsers[i].user == 'a'
          && docs.authInfo.authenticatedUsers[i].userSource == '$external')
            valid = true;
      }

      test.ok(valid);
      db.close();
      test.done();
    });
  });
}
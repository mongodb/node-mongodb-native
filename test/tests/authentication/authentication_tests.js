exports['Should correctly authenticate against admin db'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
  db1.open(function(err, db) {
    db.admin().addUser('admin', 'admin', function(err, result) {
      test.equal(null, err);

      // restart server
      configuration.restart({purgedirectories: false}, function() {

        // Attempt to save a document
        db.collection('test').insert({a:1}, function(err, result) {
          test.ok(err != null);

          // Login the user
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);
            test.ok(result);

            db.collection('test').insert({a:1}, function(err, result) {
              test.equal(null, err);

              // Logout the user
              db.admin().logout(function(err, result) {
                test.equal(null, err);

                // Attempt to save a document
                db.collection('test').insert({a:1}, function(err, result) {
                  test.ok(err != null);

                  // restart server
                  configuration.restart({purgedirectories: true}, function() {
                    db1.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

exports['Should correctly authenticate against normal db'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
  db1.open(function(err, db) {
    db.addUser('user', 'user', function(err, result) {
      test.equal(null, err);

      // An admin user must be defined for db level authentication to work correctly
      db.admin().addUser('admin', 'admin', function(err, result) {

        // restart server
        configuration.restart({purgedirectories: false}, function() {

          // Attempt to save a document
          db.collection('test').insert({a:1}, function(err, result) {
            test.ok(err != null);

            // Login the user
            db.authenticate("user", "user", function(err, result) {
              test.equal(null, err);
              test.ok(result);

              db.collection('test').insert({a:1}, function(err, result) {
                test.equal(null, err);

                // Logout the user
                db.logout(function(err, result) {
                  test.equal(null, err);

                  // Attempt to save a document
                  db.collection('test').insert({a:1}, function(err, result) {
                    test.ok(err != null);

                    // restart server
                    configuration.restart({purgedirectories: true}, function() {
                      db1.close();
                      test.done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

exports['Should correctly reapply the authentications'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
  db1.open(function(err, db) {
    db.admin().addUser('admin', 'admin', function(err, result) {
      test.equal(null, err);

      // restart server
      configuration.restart({purgedirectories: false}, function() {

        // Attempt to save a document
        db.collection('test').insert({a:1}, function(err, result) {
          test.ok(err != null);

          // Login the user
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);
            test.ok(result);

            db.collection('test').insert({a:1}, function(err, result) {
              test.equal(null, err);

              // Bounce server
              configuration.restart({purgedirectories: false}, function() {

                // Reconnect should reapply the credentials
                db.collection('test').insert({a:1}, function(err, result) {
                  test.equal(null, err);

                  // restart server
                  configuration.restart({purgedirectories: true}, function() {
                    db1.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}
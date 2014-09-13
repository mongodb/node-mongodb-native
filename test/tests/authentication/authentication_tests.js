exports['Should correctly authenticate against admin db'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // restart server
  configuration.restart({purgedirectories: true}, function() {
    var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
    db1.open(function(err, db) {
      db.admin().addUser('admin', 'admin', function(err, result) {
        test.equal(null, err);

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

  // restart server
  configuration.restart({purgedirectories: true}, function() {
    var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
    db1.open(function(err, db) {
      test.equal(null, err);

      // An admin user must be defined for db level authentication to work correctly
      db.admin().addUser('admin', 'admin', function(err, result) {

        // Authenticate against admin
        db.admin().authenticate('admin', 'admin', function(err, result) {

          db.addUser('user', 'user', function(err, result) {
            test.equal(null, err);

            // Logout admin
            db.admin().logout(function(err, result) {

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
                        db1.close();

                        // restart server
                        configuration.restart({purgedirectories: true}, function() {
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
    });
  });
}

exports['Should correctly reapply the authentications'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // restart server
  configuration.restart({purgedirectories: true}, function() {
    var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
    db1.open(function(err, db) {
      db.admin().addUser('admin', 'admin', function(err, result) {
        test.equal(null, err);

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

exports['Ordered bulk operation should fail correctly when not authenticated'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // restart server
  configuration.restart({purgedirectories: true}, function() {
    var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
    db1.open(function(err, db) {
      db.admin().addUser('admin', 'admin', function(err, result) {
        test.equal(null, err);

        // Attempt to save a document
        var col = db.collection('test');

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).updateOne({$set: {b:1}});
        batch.find({a:2}).upsert().updateOne({$set: {b:2}});
        batch.insert({a:3});
        batch.find({a:3}).remove({a:3});

        // Execute the operations
        batch.execute(function(err, result) {
          test.ok(err != null);
          test.ok(err.code != null);
          test.ok(err.errmsg != null);

          db1.close();
          test.done();
        });
      });
    });
  });
}

exports['Unordered bulk operation should fail correctly when not authenticated'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server;

  // restart server
  configuration.restart({purgedirectories: true}, function() {
    var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
    db1.open(function(err, db) {
      db.admin().addUser('admin', 'admin', function(err, result) {
        test.equal(null, err);

        // Attempt to save a document
        var col = db.collection('test');

        // Initialize the Ordered Batch
        var batch = col.initializeUnorderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).updateOne({$set: {b:1}});
        batch.find({a:2}).upsert().updateOne({$set: {b:2}});
        batch.insert({a:3});
        batch.find({a:3}).remove({a:3});

        // Execute the operations
        batch.execute(function(err, result) {
          test.ok(err != null);
          test.ok(err.code != null);
          test.ok(err.errmsg != null);

          db1.close();
          test.done();
        });
      });
    });
  });
}

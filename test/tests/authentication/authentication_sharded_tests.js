/**
 * @ignore
 */
exports['Should correctly connect to the mongoses using the connection string and auth'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , Mongos = configuration.getMongoPackage().Mongos;

  // Set up mongos connection
  var mongos = new Mongos([
    new Server("localhost", 50000, { auto_reconnect: true })
  ]);

  // Connect using the mongos connections
  new Db('integration_test_', mongos, {w:1}).open(function(err, db) {
    db.admin().addUser("root", "root", function(err, result) {
      test.equal(null, err);
  
      db.admin().authenticate("root", "root", function(err, result) {
        test.equal(null, err);
        test.ok(result);

        db.close();
        test.done();
      });
    })
  });
}
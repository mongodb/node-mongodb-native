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
    , new Server("localhost", 50001, { auto_reconnect: true })
  ]);

  // Connect using the mongos connections
  new Db('integration_test_', mongos, {w:1}).open(function(err, db) {
    db.admin().addUser("root", "root", function(err, result) {
      test.equal(null, err);
  
      db.admin().authenticate("root", "root", function(err, result) {
        test.equal(null, err);
        test.ok(result);

        // Kill the mongos server
        configuration.killMongoS(50000, function(err, result) {
          test.equal(null, err);

          db.collection('t').findOne({}, function(err, doc) {
            test.equal(null, err);

            // Restart a mongos
            configuration.restartMongoS(50000, function(err, result) {

              // Get all the connections
              var connections = db.serverConfig.allRawConnections();
              var totalLength = connections.length;
              var totalErrors = 0;

              setTimeout(function() {
                for(var i = 0; i < connections.length; i++) {
                  var cursor = db.collection('t').find({});
                  // Force the connection
                  cursor.connection = connections[i];
                  // Execute toArray
                  cursor.toArray(function(err, docs) {
                    totalLength = totalLength - 1;

                    if(totalLength == 0) {
                      test.equal(0, totalErrors);
                      db.close();                              
                      test.done();
                    }
                  });
                }
              }, 5000);
            });
          });
        });
      });
    });
  });
}
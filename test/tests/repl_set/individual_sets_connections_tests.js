exports['Should correctly connect to arbiter with single connection'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();
  // Get the arbiters
  replicasetManager.arbiters(function(err, arbiters) {
    test.equal(1, arbiters.length);
    var host = arbiters[0].split(":")[0];
    var port = parseInt(arbiters[0].split(":")[1], 10);
    var db = new Db('integration_test_', new Server(host, port), {w:1});
    db.open(function(err, p_db) {
      test.equal(null, err);

      p_db.command({ismaster: true}, function(err, result) {
        test.equal(null, err);

        p_db.close();
        test.done();
      });
    })
  });
}

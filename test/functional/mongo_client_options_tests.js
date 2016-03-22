/**
 * @ignore
 */
exports['pass in server and db top level options'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(),
            { autoReconnect: true, poolSize: 4 },
            connectionTester(test, 'testConnectServerOptions', function(db) {
      test.equal(1, db.serverConfig.poolSize);
      test.equal(4, db.serverConfig.s.server.s.pool.size);
      test.equal(true, db.serverConfig.autoReconnect);
      db.close();
      test.done();
    }));
  }
}

/**
 * @ignore
 */
function connectionTester(test, testName, callback) {
  return function(err, db) {
    test.equal(err, null);
    db.collection(testName, function(err, collection) {
      test.equal(err, null);
      var doc = {foo:123};
      collection.insert({foo:123}, {w:1}, function(err, docs) {
        test.equal(err, null);
        db.dropDatabase(function(err, done) {
          test.equal(err, null);
          test.ok(done);
          if(callback) return callback(db);
          test.done();
        });
      });
    });
  };
};

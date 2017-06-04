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
            connectionTester(test, configuration, 'testConnectServerOptions', function(client) {
      test.equal(1, client.topology.poolSize);
      test.equal(4, client.topology.s.server.s.pool.size);
      test.equal(true, client.topology.autoReconnect);
      db.close();
      test.done();
    }));
  }
}

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
            connectionTester(test, configuration, 'testConnectServerOptions', function(client) {
      test.equal(1, client.topology.poolSize);
      test.equal(4, client.topology.s.server.s.pool.size);
      test.equal(true, client.topology.autoReconnect);
      client.close();
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports['should error on unexpected options'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(), {
      autoReconnect: true, poolSize: 4, notlegal: {}, validateOptions:true
    }, function(err, client) {
      test.ok(err.message.indexOf('option notlegal is not supported') != -1);
      test.done();
    });
  }
}

/**
 * @ignore
 */
function connectionTester(test, configuration, testName, callback) {
  return function(err, client) {
    test.equal(err, null);
    var db = client.db(configuration.database);

    db.collection(testName, function(err, collection) {
      test.equal(err, null);
      var doc = {foo:123};
      collection.insert({foo:123}, {w:1}, function(err, docs) {
        test.equal(err, null);
        db.dropDatabase(function(err, done) {
          test.equal(err, null);
          test.ok(done);
          if(callback) return callback(client);
          test.done();
        });
      });
    });
  };
};

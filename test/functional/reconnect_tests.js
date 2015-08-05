/**
 * @ignore
 */
exports['Should correctly stop reconnection attempts after limit reached'] = {
  metadata: { requires: { topology: ['single'] }, ignore: { travis:true } },

  // The actual test we wish to run
  test: function(configuration, test) {
    // Create a new db instance
    var db = configuration.newDbInstance({w:1}, {
        poolSize:1
      , auto_reconnect:true
      , reconnectTries: 2
      , reconnectInterval: 100
    });

    db.open(function(err, db) {
      // Now let's stop the server
      configuration.manager.stop({signal:9}, function() {

        db.collection('waiting_for_reconnect').insert({a:1}, function(err, r) {
          test.ok(err != null);
          db.close();

          configuration.manager.start({purge:true, signal:9}, function() {
            test.done();
          });
        });
      });
    });
  }
}

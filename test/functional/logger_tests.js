/**
 * Test a simple find
 * @ignore
 */
exports['Should correctly Enable logging'] = {
  metadata: { requires: { topology: ['single'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Logger = configuration.require.Logger

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('enable_logging_1');

      // Logging setup
      Logger.setLevel('debug');
      Logger.filter('class', ['Db']);

      // Status
      var logged = false;

      // Logger.
      Logger.setCurrentLogger(function(msg, context) {
        test.ok(msg != null);
        test.equal('debug', context.type);
        test.equal('Db', context.className);
        logged = true;
      });

      // Execute the command
      db.command({ismaster: true}, function(err, r) {
        test.equal(null, err);
        test.ok(logged);

        // Clean up
        Logger.reset();
        db.close();
        test.done();
      });
    });
  }
}

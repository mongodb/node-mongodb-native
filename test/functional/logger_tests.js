'use strict';

var connectToDb = require('./shared').connectToDb;

/**
 * Test a simple find
 * @ignore
 */
exports['Should correctly Enable logging'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Logger = configuration.require.Logger;

    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);
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
      db.command({ ismaster: true }, function(err, r) {
        test.equal(null, err);
        test.ok(logged);

        // Clean up
        Logger.reset();
        client.close();
        test.done();
      });
    });
  }
};

/**
 * Should No fail with undefined id
 * @ignore
 */
exports['Should not fail with undefined id'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Logger = configuration.require.Logger;

    // set a custom logger per http://mongodb.github.io/node-mongodb-native/2.0/tutorials/logging/
    Logger.setCurrentLogger(function() {});
    Logger.setLevel('debug');

    connectToDb('mongodb://localhost:27017/test', configuration.database, function(
      err,
      db,
      client
    ) {
      test.equal(null, err);

      // perform any operation that gets logged
      db.collection('foo').findOne({}, function(err) {
        test.equal(null, err);

        // Clean up
        Logger.reset();
        client.close();
        test.done();
      });
    });
  }
};

/**
 * Should No fail with undefined id
 * @ignore
 */
exports['Should correctly log cursor'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Logger = configuration.require.Logger;

    connectToDb('mongodb://localhost:27017/test', configuration.database, function(
      err,
      db,
      client
    ) {
      test.equal(null, err);

      // Status
      var logged = false;

      // Set the current logger
      Logger.setCurrentLogger(function(msg, context) {
        test.ok(msg != null);
        test.equal('debug', context.type);
        test.equal('Cursor', context.className);
        logged = true;
      });

      // Set the filter
      Logger.setLevel('debug');
      Logger.filter('class', ['Cursor']);

      // perform any operation that gets logged
      db.collection('logging').find().toArray(function(err, d) {
        test.equal(null, err);
        test.ok(logged);

        // Clean up
        Logger.reset();
        client.close();
        test.done();
      });
    });
  }
};

/**
 * Should No fail with undefined id
 * @ignore
 */
exports['Pass the logLevel down through the options'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Logger = configuration.require.Logger;

    Logger.filter('class', ['Cursor']);
    var logged = false;

    connectToDb(
      'mongodb://localhost:27017/test',
      configuration.database,
      {
        loggerLevel: 'debug',
        logger: function() {
          logged = true;
        }
      },
      function(err, db, client) {
        test.equal(null, err);

        // perform any operation that gets logged
        db.collection('foo').findOne({}, function(err) {
          test.equal(null, err);
          test.ok(logged);

          // Clean up
          Logger.reset();
          client.close();
          test.done();
        });
      }
    );
  }
};

'use strict';

var f = require('util').format;

exports['should pass through writeConcern to all findAndModify commands at command level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var listener = require('../..').instrument(function(err, instrumentations) {});
    listener.on('started', function(event) {
      if (event.commandName == 'findandmodify') started.push(event);
    });

    listener.on('succeeded', function(event) {
      if (event.commandName == 'findandmodify') succeeded.push(event);
    });

    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      var collection = db.collection('findAndModifyTEST');
      // Execute findOneAndUpdate
      collection.findOneAndUpdate({}, { $set: { a: 1 } }, { fsync: 1 }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

        // Cleanup
        started = [];
        succeeded = [];

        // Execute findOneAndReplace
        collection.findOneAndReplace({}, { b: 1 }, { fsync: 1 }, function(err, r) {
          test.equal(null, err);
          test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

          // Cleanup
          started = [];
          succeeded = [];

          // Execute findOneAndReplace
          collection.findOneAndDelete({}, { fsync: 1 }, function(err, r) {
            test.equal(null, err);
            test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

            listener.uninstrument();
            client.close();
            test.done();
          });
        });
      });
    });
  }
};

exports['should pass through writeConcern to all findAndModify at collection level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var listener = require('../..').instrument(function(err, instrumentations) {});
    listener.on('started', function(event) {
      if (event.commandName == 'findandmodify') started.push(event);
    });

    listener.on('succeeded', function(event) {
      if (event.commandName == 'findandmodify') succeeded.push(event);
    });

    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);

      var collection = db.collection('findAndModifyTEST', { fsync: 1 });
      // Execute findOneAndUpdate
      collection.findOneAndUpdate({}, { $set: { a: 1 } }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

        // Cleanup
        started = [];
        succeeded = [];

        // Execute findOneAndReplace
        collection.findOneAndReplace({}, { b: 1 }, function(err, r) {
          test.equal(null, err);
          test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

          // Cleanup
          started = [];
          succeeded = [];

          // Execute findOneAndReplace
          collection.findOneAndDelete({}, function(err, r) {
            test.equal(null, err);
            test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

            listener.uninstrument();
            client.close();
            test.done();
          });
        });
      });
    });
  }
};

exports['should pass through writeConcern to all findAndModify at db level'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var started = [];
    var succeeded = [];
    var failed = [];

    var listener = require('../..').instrument(function(err, instrumentations) {});
    listener.on('started', function(event) {
      if (event.commandName == 'findandmodify') started.push(event);
    });

    listener.on('succeeded', function(event) {
      if (event.commandName == 'findandmodify') succeeded.push(event);
    });

    var url = configuration.url();
    url = url.indexOf('?') != -1 ? f('%s&%s', url, 'fsync=true') : f('%s?%s', url, 'fsync=true');

    // Establish connection to db
    MongoClient.connect(url, { server: { sslValidate: false } }, function(err, client) {
      test.equal(null, err);
      var db = client.db(configuration.database);
      var collection = db.collection('findAndModifyTEST');
      // Execute findOneAndUpdate
      collection.findOneAndUpdate({}, { $set: { a: 1 } }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

        // Cleanup
        started = [];
        succeeded = [];

        // Execute findOneAndReplace
        collection.findOneAndReplace({}, { b: 1 }, function(err, r) {
          test.equal(null, err);
          test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

          // Cleanup
          started = [];
          succeeded = [];

          // Execute findOneAndReplace
          collection.findOneAndDelete({}, function(err, r) {
            test.equal(null, err);
            test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

            listener.uninstrument();
            client.close();
            test.done();
          });
        });
      });
    });
  }
};

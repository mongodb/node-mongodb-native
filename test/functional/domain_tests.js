'use strict';

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForReadCommand = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {
      poolSize: 1,
      domainsEnabled: true
    });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      test.ok(!err);
      var collection = db.collection('test');

      domainInstance.run(function() {
        collection.count({}, function(err) {
          test.ok(!err);
          test.ok(domainInstance === process.domain);
          domainInstance.exit();
          domainInstance.dispose();
          client.close();
          test.done();
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForReadCommandUsingMongoClient = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var Domain = require('domain');
    var domainInstance = Domain.create();

    MongoClient.connect(
      configuration.url(),
      {
        domainsEnabled: true
      },
      function(err, client) {
        test.ok(!err);
        var db = client.db(configuration.database);
        var collection = db.collection('test');
        domainInstance.run(function() {
          collection.count({}, function(err) {
            test.ok(!err);
            test.ok(domainInstance === process.domain);
            domainInstance.exit();
            domainInstance.dispose();
            client.close();
            test.done();
          });
        });
      }
    );
  }
};

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForWriteCommand = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance(
      { w: 1 },
      { poolSize: 1, auto_reconnect: true, domainsEnabled: true }
    );

    client.connect(function(err, client) {
      test.ok(!err);
      var db = client.db(configuration.database);
      var collection = db.collection('test');
      domainInstance.run(function() {
        collection.insert({ field: 123 }, function(err) {
          test.ok(!err);
          test.ok(domainInstance === process.domain);
          domainInstance.exit();
          domainInstance.dispose();
          client.close();
          test.done();
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForQueuedReadCommand = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance(
      { w: 0, bufferMaxEntries: 0 },
      { poolSize: 1, auto_reconnect: true, domainsEnabled: true }
    );

    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      var connection = client.topology.connections()[0];
      var collection = db.collection('test');
      connection.destroy();

      domainInstance.run(function() {
        collection.count({}, function(err, c) {
          test.ok(err != null);
          test.ok(process.domain === domainInstance);
          domainInstance.exit();
          domainInstance.dispose();
          client.close();
          test.done();
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForQueuedWriteCommand = {
  metadata: {
    requires: {
      node: '>=0.10.x',
      topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance(
      { w: 1, bufferMaxEntries: 0 },
      { poolSize: 1, auto_reconnect: true, domainsEnabled: true }
    );

    client.connect(function(err, client) {
      test.ok(!err);
      var db = client.db(configuration.database);
      var connection = client.topology.connections()[0];
      var collection = db.collection('test');
      connection.destroy();

      domainInstance.run(function() {
        collection.insert({ field: 123 }, function(err) {
          test.ok(err != null);
          test.ok(process.domain === domainInstance);
          domainInstance.exit();
          domainInstance.dispose();
          client.close();
          test.done();
        });
      });
    });
  }
};

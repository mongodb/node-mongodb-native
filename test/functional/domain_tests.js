'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Decimal128', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('shouldStayInCorrectDomainForReadCommand', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var Domain = require('domain');
      var domainInstance = Domain.create();
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        poolSize: 1,
        domainsEnabled: true
      });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.ok(!err);
        var collection = db.collection('test');

        domainInstance.run(function() {
          collection.count({}, function(err) {
            test.ok(!err);
            test.ok(domainInstance === process.domain);
            domainInstance.exit();
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldStayInCorrectDomainForReadCommandUsingMongoClient', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
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
          var db = client.db(configuration.db);
          var collection = db.collection('test');
          domainInstance.run(function() {
            collection.count({}, function(err) {
              test.ok(!err);
              test.ok(domainInstance === process.domain);
              domainInstance.exit();
              client.close();
              done();
            });
          });
        }
      );
    }
  });

  /**
   * @ignore
   */
  it('shouldStayInCorrectDomainForWriteCommand', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var Domain = require('domain');
      var domainInstance = Domain.create();
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, auto_reconnect: true, domainsEnabled: true }
      );

      client.connect(function(err, client) {
        test.ok(!err);
        var db = client.db(configuration.db);
        var collection = db.collection('test');
        domainInstance.run(function() {
          collection.insert({ field: 123 }, function(err) {
            test.ok(!err);
            test.ok(domainInstance === process.domain);
            domainInstance.exit();
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldStayInCorrectDomainForQueuedReadCommand', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var Domain = require('domain');
      var domainInstance = Domain.create();
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 0, bufferMaxEntries: 0 },
        { poolSize: 1, auto_reconnect: true, domainsEnabled: true }
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var connection = client.topology.connections()[0];
        var collection = db.collection('test');
        connection.destroy();

        domainInstance.run(function() {
          collection.count({}, function(err) {
            test.ok(err != null);
            test.ok(process.domain === domainInstance);
            domainInstance.exit();
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldStayInCorrectDomainForQueuedWriteCommand', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var Domain = require('domain');
      var domainInstance = Domain.create();
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1, bufferMaxEntries: 0 },
        { poolSize: 1, auto_reconnect: true, domainsEnabled: true }
      );

      client.connect(function(err, client) {
        test.ok(!err);
        var db = client.db(configuration.db);
        var connection = client.topology.connections()[0];
        var collection = db.collection('test');
        connection.destroy();

        domainInstance.run(function() {
          collection.insert({ field: 123 }, function(err) {
            test.ok(err != null);
            test.ok(process.domain === domainInstance);
            domainInstance.exit();
            client.close();
            done();
          });
        });
      });
    }
  });
});

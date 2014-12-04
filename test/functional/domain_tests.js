"use strict";

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForReadCommand = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 0}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      test.ok(!err);
      var collection = client.collection('test');
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
}

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForWriteCommand = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 1}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      test.ok(!err);
      var collection = client.collection('test');
      domainInstance.run(function() {
        collection.insert({field: 123}, function(err) {
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
}

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForQueuedReadCommand = {
  metadata: { requires: { topology: ['single', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 0, bufferMaxEntries: 0}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      var collection = client.collection('test');
      client.serverConfig.connectionPool.openConnections[0].connection.destroy();

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
}

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForQueuedWriteCommand = {
  metadata: { requires: { node: ">=0.10.x", topology: ['single', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain = require('domain');
    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 1, bufferMaxEntries: 0}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      test.ok(!err);
      var collection = client.collection('test');
      client.serverConfig.connectionPool.openConnections[0].connection.destroy();

      domainInstance.run(function() {
        collection.insert({field: 123}, function(err) {
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
}
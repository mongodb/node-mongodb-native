/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForReadCommand = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain;

    try {
      Domain = require('domain');
    } catch (e) {
      //Old node versions. Nothing to test
      test.done();
      return;
    }

    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 0}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      test.ok(!err);
      var collection = client.collection('test');
      domainInstance.run(function() {
        collection.count({}, function(err) {
          test.ok(!err);
          test.ok(domainInstance === process.domain);
          domainInstance.dispose();
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
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain;

    try {
      Domain = require('domain');
    } catch (e) {
      //Old node versions. Nothing to test
      test.done();
      return;
    }

    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 1}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      test.ok(!err);
      var collection = client.collection('test');
      domainInstance.run(function() {
        collection.insert({field: 123}, function(err) {
          test.ok(!err);
          test.ok(domainInstance === process.domain);
          domainInstance.dispose();
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
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain;

    try {
      Domain = require('domain');
    } catch (e) {
      //Old node versions. Nothing to test
      test.done();
      return;
    }

    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 0}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      var connection = client.serverConfig.connections()[0];
      var collection = client.collection('test');
      connection.destroy();

      domainInstance.run(function() {
        collection.count({}, function(err) {
          test.ok(err != null);
          test.ok(process.domain === domainInstance);
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
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Domain;

    try {
      Domain = require('domain');
    } catch (e) {
      //Old node versions. Nothing to test
      test.done();
      return;
    }

    var domainInstance = Domain.create();
    var client = configuration.newDbInstance({w: 1}, {poolSize: 1, auto_reconnect: true});

    client.open(function(err, client) {
      test.ok(!err);
      var connection = client.serverConfig.connections()[0];
      var collection = client.collection('test');
      connection.destroy();

      domainInstance.run(function() {
        collection.insert({field: 123}, function(err) {
          test.ok(err != null);
          test.ok(process.domain === domainInstance);
          domainInstance.dispose();
          test.done();
        });
      });
    });
  }
}
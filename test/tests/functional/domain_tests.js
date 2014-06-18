/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForReadCommand = function(configuration, test) {
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
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForWriteCommand = function(configuration, test) {
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
        test.done();
      });
    });
  });
}


/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForQueuedReadCommand = function(configuration, test) {
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
    var connection = client.serverConfig.connectionPool.openConnections[0];
    var collection = client.collection('test');

    //imitate connection error, to make commands queued into
    //commandsStore
    connection.emit('error', {err: 'fake disconnect'}, connection);

    domainInstance.run(function() {
      collection.count({}, function(err) {
        test.ok(!err);
        test.ok(process.domain === domainInstance);
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldStayInCorrectDomainForQueuedWriteCommand = function(configuration, test) {
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
    var connection = client.serverConfig.connectionPool.openConnections[0];
    var collection = client.collection('test');

    //imitate connection error, to make commands queued into
    //commandsStore
    connection.emit('error', {err: 'fake disconnect'}, connection);

    domainInstance.run(function() {
      collection.insert({field: 123}, function(err) {
        test.ok(!err);
        test.ok(process.domain === domainInstance);
        test.done();
      });
    });
  });
}

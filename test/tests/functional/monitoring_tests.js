"use strict";
var assign = require('../../../lib/utils').assign;

var timeoutPromise = function(timeout) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
}

exports['Should not create excessive amount of Timeouts in intervalIds array'] = {
  metadata: {
    requires: {
      // generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      ObjectId = configuration.require.BSON.ObjectId,
      // Connection = require('../../../lib/connection/connection'),
      // co = require('co'),
      mockupdb = require('../../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];
    // Current index for the ismaster
    var currentIsMasterState = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[currentIsMasterState],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 3,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"]
    }

    // Primary server states
    var primary = [assign({}, defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000"
    }), assign({}, defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32000", "primary": "localhost:32001"
    })];

    // Primary server states
    var firstSecondary = [assign({}, defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000"
    }), assign({}, defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32001", "primary": "localhost:32001"
    })];

    // Primary server states
    var secondSecondary = [assign({}, defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000"
    }), assign({}, defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32001"
    })];

    // Boot the mock
    Promise.all([
      mockupdb.createServer(32000, 'localhost').then(function(server) { primaryServer = server; }),
      mockupdb.createServer(32001, 'localhost').then(function(server) { firstSecondaryServer = server; }),
      mockupdb.createServer(32002, 'localhost').then(function(server) { secondSecondaryServer = server; })
    ]).then(function() {
      function runInfinitely(fn) {
        return primaryServer.receive().then(function(request) {
          if (fn(request)) { return runInfinitely(fn); }
        });
      }

      // Primary state machine
      runInfinitely(function(request) {
        var doc = request.document;

        if(doc.ismaster && currentIsMasterState == 0) {
          request.reply(primary[currentIsMasterState]);
        }
        return running;
      })

      // First secondary state machine
      runInfinitely(function(request) {
        var doc = request.document;

        if(doc.ismaster) {
          request.reply(firstSecondary[currentIsMasterState]);
        }
        return running;
      });

      // Second secondary state machine
      runInfinitely(function(request) {
        var doc = request.document;

        if(doc.ismaster) {
          request.reply(secondSecondary[currentIsMasterState]);
        }
        return running;
      });

    });

    // Attempt to connect
    var server = new ReplSet([
      { host: 'localhost', port: 32000 },
      { host: 'localhost', port: 32001 },
      { host: 'localhost', port: 32002 }], {
        setName: 'rs',
        connectionTimeout: 5000,
        socketTimeout: 60000,
        haInterval: 200,
        size: 1
    });

    // Add event listeners
    server.on('connect', function(_server) {
      setTimeout(function() {
        console.dir("Total amount of Timeout instances running: " + _server.intervalIds.length);
        test.ok(_server.intervalIds.length === 3);

        // Destroy mock
        primaryServer.destroy();
        firstSecondaryServer.destroy();
        secondSecondaryServer.destroy();
        server.destroy();
        running = false;

        test.equal(0, _server.intervalIds.length);

        test.done();
      }, 5000);
    });

    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}

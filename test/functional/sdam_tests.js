'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe.skip('SDAM', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('Should correctly emit all Replicaset SDAM operations', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var operations = {
        serverDescriptionChanged: [],
        serverHeartbeatStarted: [],
        serverHeartbeatSucceeded: [],
        serverOpening: [],
        serverClosed: [],
        topologyOpening: [],
        topologyDescriptionChanged: [],
        topologyClosed: []
      };

      var client = configuration.newClient();
      var events = [
        'serverDescriptionChanged',
        'serverHeartbeatStarted',
        'serverHeartbeatSucceeded',
        'serverOpening',
        'serverClosed',
        'topologyOpening',
        'topologyDescriptionChanged',
        'topologyClosed'
      ];
      events.forEach(function(e) {
        client.on(e, function(result) {
          operations[e].push(result);
        });
      });

      client.connect(function(err) {
        test.equal(null, err);

        client.close(true, function() {
          setTimeout(() => {
            for (var name in operations) {
              test.ok(operations[name].length > 0);
            }

            done();
          }, 1000);
        });
      });
    }
  });

  it('Should correctly emit all Mongos SDAM operations', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var operations = {
        serverDescriptionChanged: [],
        serverHeartbeatStarted: [],
        serverHeartbeatSucceeded: [],
        serverOpening: [],
        serverClosed: [],
        topologyOpening: [],
        topologyDescriptionChanged: [],
        topologyClosed: []
      };

      var client = configuration.newClient({}, { haInterval: 500 });
      var events = [
        'serverDescriptionChanged',
        'serverHeartbeatStarted',
        'serverHeartbeatSucceeded',
        'serverOpening',
        'serverClosed',
        'topologyOpening',
        'topologyDescriptionChanged',
        'topologyClosed'
      ];
      events.forEach(function(e) {
        client.on(e, function(result) {
          operations[e].push(result);
        });
      });

      client.on('fullsetup', function(topology) {
        setTimeout(function() {
          topology.close();

          for (var name in operations) {
            test.ok(operations[name].length > 0);
          }

          done();
        }, 1000);
      });

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  it('Should correctly emit all Server SDAM operations', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var operations = {
        serverDescriptionChanged: [],
        serverOpening: [],
        serverClosed: [],
        topologyOpening: [],
        topologyDescriptionChanged: [],
        topologyClosed: []
      };

      var client = configuration.newClient();
      var events = [
        'serverDescriptionChanged',
        'serverOpening',
        'serverClosed',
        'topologyOpening',
        'topologyDescriptionChanged',
        'topologyClosed'
      ];
      events.forEach(function(e) {
        client.on(e, function(result) {
          operations[e].push(result);
        });
      });

      client.connect(function(err, client) {
        test.equal(null, err);
        client.close(true, () => {
          for (var name in operations) {
            test.ok(operations[name].length > 0);
          }

          done();
        });
      });
    }
  });
});

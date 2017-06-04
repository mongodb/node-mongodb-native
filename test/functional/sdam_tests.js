exports['Should correctly emit all Replicaset SDAM operations'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var operations = {
      serverDescriptionChanged: [],
      serverHeartbeatStarted: [],
      serverHeartbeatSucceeded: [],
      serverOpening: [],
      serverClosed: [],
      topologyOpening: [],
      topologyDescriptionChanged: [],
      topologyClosed: [],
    }

    var client = new MongoClient(configuration.url());
    var events = ['serverDescriptionChanged', 'serverHeartbeatStarted'
      , 'serverHeartbeatSucceeded', 'serverOpening'
      , 'serverClosed', 'topologyOpening', 'topologyDescriptionChanged'
      , 'topologyClosed'];
    events.forEach(function(e) {
      client.on(e, function(result) {
        operations[e].push(result);
      });
    });

    client.on('fullsetup', function(topology) {
      topology.close(true);

      // console.log(JSON.stringify(operations.topologyDescriptionChanged, null, 2));

      for(var name in operations) {
        test.ok(operations[name].length > 0);
      }

      test.done();      
    });

    client.connect(function(err, db) {
      test.equal(null, err);
    });
  }
}

exports['Should correctly emit all Mongos SDAM operations'] = {
  metadata: { requires: { topology: 'sharded' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var operations = {
      serverDescriptionChanged: [],
      serverHeartbeatStarted: [],
      serverHeartbeatSucceeded: [],
      serverOpening: [],
      serverClosed: [],
      topologyOpening: [],
      topologyDescriptionChanged: [],
      topologyClosed: [],
    }

    var client = new MongoClient();
    var events = ['serverDescriptionChanged', 'serverHeartbeatStarted'
      , 'serverHeartbeatSucceeded', 'serverOpening'
      , 'serverClosed', 'topologyOpening', 'topologyDescriptionChanged'
      , 'topologyClosed'];
    events.forEach(function(e) {
      client.on(e, function(result) {
        operations[e].push(result);
      });
    });

    client.on('fullsetup', function(topology) {
      setTimeout(function() {
        topology.close();

        // console.log(JSON.stringify(operations, null, 2));

        for(var name in operations) {
          test.ok(operations[name].length > 0);
        }

        test.done();      
      }, 1000);
    });

    var url = configuration.url();
    client.connect(url, { haInterval: 500 }, function(err, db) {
      test.equal(null, err);
    });
  }
}

exports['Should correctly emit all Server SDAM operations'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var operations = {
      serverDescriptionChanged: [],
      serverOpening: [],
      serverClosed: [],
      topologyOpening: [],
      topologyDescriptionChanged: [],
      topologyClosed: [],
    }

    var client = new MongoClient(configuration.url());
    var events = ['serverDescriptionChanged', 'serverOpening'
      , 'serverClosed', 'topologyOpening', 'topologyDescriptionChanged'
      , 'topologyClosed'];
    events.forEach(function(e) {
      client.on(e, function(result) {
        operations[e].push(result);
      });
    });

    client.connect(function(err, client) {
      test.equal(null, err);
      client.close(true);

      for(var name in operations) {
        test.ok(operations[name].length > 0);
      }

      // console.log(JSON.stringify(operations, null, 2));
      test.done();      
    });
  }
}

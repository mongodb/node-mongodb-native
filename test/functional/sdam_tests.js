exports['Should correctly emit all SDAM operations'] = {
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

    client.on('fullsetup', function(err, topology) {
      topology.close(true);
      for(var name in operations) {
        // console.log("------------------------------ " +name)
        test.ok(operations[name].length > 0);
      }

      // console.log(JSON.stringify(operations, null, 2));
      test.done();      
    });

    client.connect(configuration.url(), function(err, db) {
      test.equal(null, err);
    });
  }
}

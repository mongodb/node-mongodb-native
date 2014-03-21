exports['Should correctly connect to single server'] = {
  metadata: {},

  test: function(configuration, test) {
    var Connection = configuration.require.Connection;

    // Attempt to connect
    var connection = new Connection({
        id: 1
      , host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    connection.on('connect', function(_connection) {
      connection.destroy();
      test.done();
    })

    // Start connection
    connection.connect();
  }
}

exports['Should fail connect to single server'] = {
  metadata: {},

  test: function(configuration, test) {
    var Connection = configuration.require.Connection;

    // Attempt to connect
    var connection = new Connection({
        id: 1
      , host: configuration.host
      , port: 23343
    })

    // Add event listeners
    connection.on('error', function(err) {
      // console.dir(err)
      test.ok(err instanceof configuration.require.MongoError)
      connection.destroy();
      test.done();
    })

    // Start connection
    connection.connect();
  }
}
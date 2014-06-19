exports['Should correctly connect pool to single server'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: bson
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      _pool.destroy();
      test.done();
    })

    // Start connection
    pool.connect();
  }
}

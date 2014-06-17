exports['Should correctly use a ping strategy to pick a node'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
        , ReadPreference = configuration.require.ReadPreference;

    // Get the basic auth provider
    var MongoCR = configuration.require.MongoCR;
    var finished = false;

    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }], {
        reconnectInterval: 2000
      , setName: configuration.setName
    });

    // Register basic auth provider
    server.addReadPreferenceStrategy('ping', {
      state: {},

      pickServer: function(set, options) {
        finished = true;
        return state.primary;
      },

      startOperation: function(server, query, date) {
      },

      endOperation: function(server, err, result, date) {
      },

      close: function(server) {
      },

      error: function(server) {
      },

      timeout: function(server) {
      },

      connect: function(server, callback) {
        callback(null, null);
      },

      ha: function(state, callback) {
        this.state = state;
        callback(null, null);
      },
    });

    // Add event listeners
    server.on('connect', function(_server) {
      var internval = setInterval(function() {
        _server.command('system.$cmd'
          , {ismaster:true}
          , {readPreference: new ReadPreference('ping', [{rack: 'sf'}])}, function(err, r) {

            if(finished) {
              clearInterval(internval);
              _server.destroy();
              test.done();
            }
        });
      }, 1000);
    });
  
    // Start connection
    server.connect();
  }
}
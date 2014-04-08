exports['Should correctly use a ping strategy to pick a node'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet;

    // Get the basic auth provider
    var MongoCR = configuration.require.MongoCR;

    // Attempt to connect
    var server = new ReplSet([{
        host: configuration.host
      , port: configuration.port
    }], {reconnectInterval: 500});

    // Register basic auth provider
    server.addReadPreferenceStrategy('ping', {
      pings: {},

      pickServer: function(set, options) {
        console.log("======================= pickServer")
        return null;
      },

      startOperation: function(server, query, date) {
      },

      // endOperation: funtion()

      execute: function(set, callback) {
        var self = this;
        var servers = set.getAll();
        var count = servers.length;
        // No servers return
        if(servers.length == 0) return callback(null, null);

        // Execute operation
        var operation = function(_server) {
          var start = new Date();
          
          // Execute ping against server
          _server.command('system.$cmd', {ping:1}, function(err, r) {
            count = count - 1;
            var time = new Date().getTime() - start.getTime();
            self.pings[_server.name] = time;

            if(count == 0) {
              callback(null, null);
            }
          });
        }

        // Let's ping all servers
        while(servers.length > 0) {
          operation(servers.shift());
        }
      }
    });

    // Add event listeners
    server.on('connect', function(_server) {
      _server.destroy();
      test.done();
    });
  
    // Start connection
    server.connect();
  }
}
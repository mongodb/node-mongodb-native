var f = require('util').format
  , Long = require('bson').Long;

// exports['Should correctly connect using mongos object'] = {
//   metadata: {
//     requires: {
//       topology: "mongos"
//     }
//   },

//   test: function(configuration, test) {
//     var Mongos = configuration.require.Mongos;

//     // Attempt to connect
//     var server = new Mongos([{
//         host: configuration.host
//       , port: configuration.port
//     }, {
//         host: configuration.host
//       , port: configuration.port + 1
//     }])

//     // Add event listeners
//     server.on('connect', function(_server) {
//       setTimeout(function() {
//         test.equal(true, _server.isConnected());
//         _server.destroy();
//         test.equal(false, _server.isConnected());
//         test.done();        
//       }, 100);
//     })

//     // Start connection
//     server.connect();
//   }
// }

// exports['Should correctly execute command using mongos'] = {
//   metadata: {
//     requires: {
//       topology: "mongos"
//     }
//   },

//   test: function(configuration, test) {
//     var Mongos = configuration.require.Mongos;

//     // Attempt to connect
//     var server = new Mongos([{
//         host: configuration.host
//       , port: configuration.port
//     }]);

//     // Add event listeners
//     server.on('connect', function(_server) {
//       // Execute the command
//       _server.command("system.$cmd", {ismaster: true}, {readPreference: 'primary'}, function(err, result) {
//         test.equal(null, err);
//         test.equal(true, result.result.ismaster);
//         // Destroy the connection
//         _server.destroy();
//         // Finish the test
//         test.done();
//       });      
//     });

//     // Start connection
//     server.connect();
//   }
// }

// exports['Should correctly execute write using replset'] = {
//   metadata: {
//     requires: {
//       topology: "mongos"
//     }
//   },

//   test: function(configuration, test) {
//     var Mongos = configuration.require.Mongos;

//     // Attempt to connect
//     var server = new Mongos([{
//         host: configuration.host
//       , port: configuration.port
//     }]);

//     // Add event listeners
//     server.on('connect', function(_server) {
//       // Execute the write
//       _server.insert(f("%s.inserts_mongos1", configuration.db), [{a:1}], {
//         writeConcern: {w:1}, ordered:true
//       }, function(err, results) {
//         test.equal(null, err);
//         test.equal(1, results.result.n);
//         // Destroy the connection
//         _server.destroy();
//         // Finish the test
//         test.done();
//       });
//     })

//     // Start connection
//     server.connect();
//   }
// }

exports['Should correctly recover from shit of servers'] = {
  metadata: {
    requires: {
      topology: "mongos"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;
    var Logger = configuration.require.Logger;

    // Set info level
    Logger.setLevel('info');

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }, {
        host: configuration.host
      , port: configuration.port + 1
    }])

    // // Attempt to connect
    // var server = new Mongos([{
    //     host: configuration.host
    //   , port: configuration.port
    // }]);

    console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^")
    console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^")
    console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^")

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts_mongos2", configuration.db), [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        setInterval(function() {
    console.log("================== 0")
          try {
            // Execute find
            var cursor = _server.cursor(f("%s.inserts_mongos2", configuration.db), {
                find: f("%s.inserts_repl2", configuration.db)
              , query: {}
            });

            // Execute next
            cursor.next(function(err, d) {            
              console.log("========================= tick")
              console.dir(err)
              console.dir(d)
            });            
          } catch(err) {}
        }, 1000);
        // test.equal(null, err);
        // test.equal(1, results.result.n);
        // // Destroy the connection
        // _server.destroy();
        // // Finish the test
        // test.done();
      });
    })

    // Start connection
    server.connect();
  }
}

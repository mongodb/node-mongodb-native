var f = require('util').format;

exports['Should correctly connect using server object'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    server.on('connect', function(_server) {
      _server.destroy();
      test.done();
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute command'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: 'primary'}, function(err, result) {
        test.equal(null, err);
        console.dir(result)
        // Destroy the connection
        _server.destroy();
        // Finish the test
        test.done();
      });      
    })

    // Start connection
    server.connect();
  }
}

exports['Should correctly execute write'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Add event listeners
    server.on('connect', function(_server) {
      // Execute the write
      _server.insert(f("%s.inserts", configuration.db), [{a:1}], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        console.log("===========================================")
        console.dir(err)
        console.dir(results)
        // Destroy the connection
        _server.destroy();
        // Finish the test
        test.done();
      });
      // // Execute the command
      // _server.command("system.$cmd", {ismaster: true}, {readPreference: 'primary'}, function(err, result) {
      //   test.equal(null, err);
      //   console.dir(result)
      //   // Destroy the connection
      //   _server.destroy();
      //   // Finish the test
      //   test.done();
      // });      
    })

    // Start connection
    server.connect();
  }
}


// exports['Should correctly execute find'] = {
//   metadata: {},

//   test: function(configuration, test) {
//     var Server = configuration.require.Server;

//     // Attempt to connect
//     var server = new Server({
//         host: configuration.host
//       , port: configuration.port
//     })

//     // Add event listeners
//     server.on('connect', function(_server) {
//       // Execute the command
//       _server.command("system.$cmd", {ismaster: true}, {readPreference: 'primary'}, function(err, result) {
//         test.equal(null, err);
//         console.dir(result)
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

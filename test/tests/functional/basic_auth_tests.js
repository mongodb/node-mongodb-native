var f = require('util').format
  , crypto = require('crypto');

exports['Simple authentication test'] = {
  metadata: {},

  test: function(configuration, test) {
    var Server = configuration.require.Server;

    // Get the basic auth provider
    var MongoCR = configuration.require.MongoCR;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
    })

    // Register basic auth provider
    server.addAuthProvider('mongocr', new MongoCR());

    // Add event listeners
    server.on('connect', function(_server) {
      var password = 'test';
      var username = 'test';
      // Use node md5 generator
      var md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(username + ":mongo:" + password);
      var userPassword = md5.digest('hex');

      // Add a new user
      _server.command(f("%s.$cmd", configuration.db), {
          createUser: username
        , pwd: userPassword
        , roles: ['dbOwner']
        , digestPassword: false
        , writeConcern: {w:1}
      }, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.ok);
        // Grab the connection
        var connection = r.connection;

        // Authenticate 
        _server.auth('mongocr', configuration.db, 'test', 'test', function(err, r) {
          test.equal(null, err);
          test.equal(true, r);

          // Reconnect message
          _server.once('reconnect', function() {
            // Add a new user
            _server.command(f("%s.$cmd", configuration.db), {
                dropUser: username
              , writeConcern: {w:1}
            }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.ok);
              _server.destroy();
              test.done();
            });
          });

          // Write garbage, force socket closure
          try {
            var a = new Buffer(100);
            for(var i = 0; i < 100; i++) a[i] = i;
            connection.write(a);
          } catch(err) {}
        });
      });
    })

    // Start connection
    server.connect();
  }
}
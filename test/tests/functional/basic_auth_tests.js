"use strict";

var f = require('util').format
  , crypto = require('crypto');

exports['Simple authentication test for single server'] = {
  metadata: {
    requires: {
        topology: "single"
      , mongodb: ">2.6.0 <=2.7.0"
    }
  },

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
        console.log("--------------------------------------------- TEST 0 :: " + configuration.db)
        // Authenticate
        _server.auth('mongocr', configuration.db, 'test', 'test', function(err, session) {
          console.log("--------------------------------------------- TEST 1")
          console.dir(err)
          test.equal(null, err);
          test.ok(session != null);
          // Reconnect message
          _server.once('reconnect', function() {
            // Add a new user
            session.command(f("%s.$cmd", configuration.db), {
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

exports['Simple authentication test for replicaset'] = {
  metadata: {
    requires: {
        topology: "replicaset"
      , mongodb: ">2.6.0 <=2.7.0"
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
    }], {
        reconnectInterval: 500
      , setName: configuration.setName
    });

    // Register basic auth provider
    server.addAuthProvider('mongocr', new MongoCR());

    // Add event listeners
    server.on('fullsetup', function(_server) {
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
        , writeConcern: {w:'majority'}
      }, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.ok);
        // Grab the connection
        var connection = r.connection;

        // Authenticate
        _server.auth('mongocr', configuration.db, 'test', 'test', function(err, session) {
          test.equal(null, err);
          test.ok(session != null);

          _server.on('joined', function(t, s) {
            if(t == 'primary') {
              session.command(f("%s.$cmd", configuration.db), {
                  dropUser: username
                , writeConcern: {w:1}
              }, function(err, r) {
                test.equal(null, err);
                test.equal(1, r.result.ok);
                _server.destroy();
                test.done();
              });
            }
          })

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

exports['Simple authentication test for mongos'] = {
  metadata: {
    requires: {
        topology: "mongos"
      , mongodb: ">2.6.0 <=2.7.0"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos;

    // Get the basic auth provider
    var MongoCR = configuration.require.MongoCR;

    // Attempt to connect
    var server = new Mongos([{
        host: configuration.host
      , port: configuration.port
    }, {
        host: configuration.host
      , port: configuration.port + 1
    }])

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
        _server.auth('mongocr', configuration.db, 'test', 'test', function(err, session) {
          test.equal(null, err);
          test.ok(session != null);

          // Wait for reconnect to happen
          setTimeout(function() {
            session.command(f("%s.$cmd", configuration.db), {
                dropUser: username
              , writeConcern: {w:1}
            }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.ok);
              _server.destroy();
              test.done();
            });
          }, 1000);

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

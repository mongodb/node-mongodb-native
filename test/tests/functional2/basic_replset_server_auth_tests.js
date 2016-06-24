"use strict";

var f = require('util').format,
  locateAuthMethod = require('./shared').locateAuthMethod,
  executeCommand = require('./shared').executeCommand;

var setUp = function(configuration, options, callback) {
  var ReplSetManager = require('mongodb-topology-manager').ReplSet;

  // Check if we have any options
  if(typeof options == 'function') callback = options, options = null;

  // Override options
  if(options) {
    var rsOptions = options;
  } else {
    var rsOptions = {
      server: {
        keyFile: __dirname + '/key/keyfile.key',
        auth: null, replSet: 'rs'
      },
      client: { replSet: 'rs' }
    }
  }

  // Set up the nodes
  var nodes = [{
    options: {
      bind_ip: 'localhost', port: 31000,
      dbpath: f('%s/../db/31000', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31001,
      dbpath: f('%s/../db/31001', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31002,
      dbpath: f('%s/../db/31002', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31003,
      dbpath: f('%s/../db/31003', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31004,
      dbpath: f('%s/../db/31004', __dirname),
    }
  }]

  // Merge in any node start up options
  for(var i = 0; i < nodes.length; i++) {
    for(var name in rsOptions.server) {
      nodes[i].options[name] = rsOptions.server[name];
    }
  }

  // Create a manager
  var replicasetManager = new ReplSetManager('mongod', nodes, rsOptions.client);
  // Purge the set
  replicasetManager.purge().then(function() {
    // Start the server
    replicasetManager.start().then(function() {
      setTimeout(function() {
        callback(null, replicasetManager);
      }, 10000);
    }).catch(function(e) {
      console.dir(e);
    });
  });
}

exports['Should fail to authenticat emitting an error due to it being the initial connect'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var ReplSet = require('../../../lib2/topologies/replset')
      , Connection = require('../../../lib2/connection/connection')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    setUp(configuration, function(err, replicasetManager) {
      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Get right auth method
      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root',
          pwd: "root",
          roles: [ { role: "root", db: "admin" } ],
          digestPassword: true
        }, {
          host: 'localhost', port: 31000
        }, function(err, r) {
          test.equal(null, err);

          // Attempt to connect
          var server = new ReplSet([{
              host: 'localhost'
            , port: 31000
          }, {
              host: 'localhost'
            , port: 31001
          }], {
            setName: 'rs'
          });

          server.on('connect', function(_server) {
          });

          server.on('error', function() {
            // console.log("=================== " + Object.keys(Connection.connections()).length)
            test.equal(0, Object.keys(Connection.connections()).length);
            Connection.disableConnectionAccounting();

            executeCommand(configuration, 'admin', {
              dropUser: 'root'
            }, {
                auth: [method, 'admin', 'root', 'root']
              , host: 'localhost', port: 31000
            }, function(err, r) {
              replicasetManager.stop().then(function() {
                test.done();
              });
            });
          });

          server.connect({auth: [method, 'admin', 'root2', 'root']});
        });
      });
    });
  }
}

exports['Should correctly authenticate server using scram-sha-1 using connect auth'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var ReplSet = require('../../../lib2/topologies/replset')
      , Connection = require('../../../lib2/connection/connection')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    setUp(configuration, function(err, replicasetManager) {
      // Enable connections accounting
      Connection.enableConnectionAccounting();

      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root',
          pwd: "root",
          roles: [ { role: "root", db: "admin" } ],
          digestPassword: true
        }, {
          host: 'localhost', port: 31000
        }, function(err, r) {
          test.equal(null, err);

          // Attempt to connect
          var server = new ReplSet([{
            host: 'localhost', port: 31000
          }, {
            host: 'localhost', port: 31001
          }], {
            setName: 'rs'
          });

          server.on('connect', function(_server) {
            _server.insert('test.test', [{a:1}], function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.n);

              executeCommand(configuration, 'admin', {
                dropUser: 'root'
              }, {
                  auth: [method, 'admin', 'root', 'root']
                , host: 'localhost', port: 31000
              }, function(err, r) {
                test.equal(null, err);

                _server.destroy();
                // console.log("=================== " + Object.keys(Connection.connections()).length)
                test.equal(0, Object.keys(Connection.connections()).length);
                Connection.disableConnectionAccounting();

                replicasetManager.stop().then(function() {
                  test.done();
                });
              });
            });
          });

          server.connect({auth: [method, 'admin', 'root', 'root']});
        });
      });
    });
  }
}

exports['Should correctly authenticate using auth method instead of connect'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var ReplSet = require('../../../lib2/topologies/replset')
      , Connection = require('../../../lib2/connection/connection')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    setUp(configuration, function(err, replicasetManager) {
      // Enable connections accounting
      Connection.enableConnectionAccounting();

      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root',
          pwd: "root",
          roles: [ { role: "root", db: "admin" } ],
          digestPassword: true
        }, {
          host: 'localhost', port: 31000
        }, function(err, r) {
          test.equal(null, err);
          // process.exit(0)

          // Attempt to connect
          var server = new ReplSet([{
            host: 'localhost', port: 31000
          }], {
            setName: 'rs'
          });

          server.on('connect', function(_server) {
            //{auth: [method, 'admin', 'root', 'root']}
            // Attempt authentication
            _server.auth(method, 'admin', 'root', 'root', function(err, r) {
              _server.insert('test.test', [{a:1}], function(err, r) {
                test.equal(null, err);
                test.equal(1, r.result.n);

                executeCommand(configuration, 'admin', {
                  dropUser: 'root'
                }, {
                    auth: [method, 'admin', 'root', 'root']
                  , host: 'localhost', port: 31000
                }, function(err, r) {
                  test.equal(null, err);

                  _server.destroy();
                  // console.log("=================== " + Object.keys(Connection.connections()).length)
                  test.equal(0, Object.keys(Connection.connections()).length);
                  Connection.disableConnectionAccounting();

                  replicasetManager.stop().then(function() {
                    test.done();
                  });
                });
              });
            });
          });

          server.connect();
        });
      });
    });
  }
}




















// exports['Should correctly authenticate server using scram-sha-1 using connect auth and maintain auth on new connections'] = {
//   metadata: { requires: { topology: "auth" } },
//
//   test: function(configuration, test) {
//     var Server = require('../../../lib2/topologies/server')
//       , Connection = require('../../../lib2/connection/connection')
//       , bson = require('bson').BSONPure.BSON
//       , Query = require('../../../lib2/connection/commands').Query;
//
//     // Enable connections accounting
//     Connection.enableConnectionAccounting();
//
//     // Restart instance
//     configuration.manager.restart(true).then(function() {
//       locateAuthMethod(configuration, function(err, method) {
//         test.equal(null, err);
//
//         executeCommand(configuration, 'admin', {
//           createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
//         }, function(err, r) {
//           test.equal(null, err);
//
//           executeCommand(configuration, 'test', {
//             createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
//           }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
//             test.equal(null, err);
//
//             // Attempt to connect
//             var server = new Server({
//               host: configuration.host, port: configuration.port, bson: new bson()
//             })
//
//             var index = 0;
//
//             var messageHandler = function(err, result) {
//               index = index + 1;
//
//               // Tests
//               test.equal(null, err);
//               test.equal(1, result.result.n);
//               // Did we receive an answer for all the messages
//               if(index == 100) {
//                 test.equal(5, server.s.pool.socketCount());
//
//                 server.destroy();
//                 // console.log("=================== " + Object.keys(Connection.connections()).length)
//                 test.equal(0, Object.keys(Connection.connections()).length);
//                 Connection.disableConnectionAccounting();
//                 test.done();
//               }
//             }
//
//             // Add event listeners
//             server.on('connect', function(_pool) {
//               for(var i = 0; i < 10; i++)
//               process.nextTick(function() {
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//                 server.insert('test.test', [{a:1}], messageHandler);
//               });
//             });
//
//             // Start connection
//             server.connect({auth: [method, 'test', 'admin', 'admin']});
//           });
//         });
//       });
//     });
//   }
// }
//
// exports['Should correctly authenticate server using scram-sha-1 using auth method'] = {
//   metadata: { requires: { topology: "auth" } },
//
//   test: function(configuration, test) {
//     var Server = require('../../../lib2/topologies/server')
//       , Connection = require('../../../lib2/connection/connection')
//       , bson = require('bson').BSONPure.BSON
//       , Query = require('../../../lib2/connection/commands').Query;
//
//     // Enable connections accounting
//     Connection.enableConnectionAccounting();
//
//     // Restart instance
//     configuration.manager.restart(true).then(function() {
//       locateAuthMethod(configuration, function(err, method) {
//         test.equal(null, err);
//
//         executeCommand(configuration, 'admin', {
//           createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
//         }, function(err, r) {
//           test.equal(null, err);
//
//           executeCommand(configuration, 'test', {
//             createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
//           }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
//             test.equal(null, err);
//
//             // Attempt to connect
//             var server = new Server({
//               host: configuration.host, port: configuration.port, bson: new bson()
//             })
//
//             var index = 0;
//             var error = false;
//
//             var messageHandler = function(err, result) {
//               index = index + 1;
//
//               // Tests
//               test.equal(null, err);
//               test.equal(1, result.result.n);
//               // Did we receive an answer for all the messages
//               if(index == 100) {
//                 test.equal(5, server.s.pool.socketCount());
//                 test.equal(false, error);
//
//                 server.destroy();
//                 // console.log("=================== " + Object.keys(Connection.connections()).length)
//                 test.equal(0, Object.keys(Connection.connections()).length);
//                 Connection.disableConnectionAccounting();
//                 test.done();
//               }
//             }
//
//             // Add event listeners
//             server.on('connect', function(_server) {
//               _server.auth(method, 'test', 'admin', 'admin', function(err, r) {
//                 for(var i = 0; i < 100; i++) {
//                   // console.log("!!!!!!!!!!! 1")
//                   process.nextTick(function() {
//                     server.insert('test.test', [{a:1}], messageHandler);
//                   });
//                 }
//               });
//
//               for(var i = 0; i < 100; i++) {
//                 process.nextTick(function() {
//                   // console.log("!!!!!!!!!!! 0")
//                   _server.command('admin.$cmd', {ismaster:true}, function(e, r) {
//                     // console.dir(e)
//                     if(e) error = e;
//                   });
//                 });
//               }
//             });
//
//             // Start connection
//             server.connect();
//           });
//         });
//       });
//     });
//   }
// }
//
// exports['Should correctly authenticate server using scram-sha-1 using connect auth then logout'] = {
//   metadata: { requires: { topology: "auth" } },
//
//   test: function(configuration, test) {
//     var Server = require('../../../lib2/topologies/server')
//       , Connection = require('../../../lib2/connection/connection')
//       , bson = require('bson').BSONPure.BSON
//       , Query = require('../../../lib2/connection/commands').Query;
//
//     // Enable connections accounting
//     Connection.enableConnectionAccounting();
//
//     // Restart instance
//     configuration.manager.restart(true).then(function() {
//       locateAuthMethod(configuration, function(err, method) {
//         test.equal(null, err);
//
//         executeCommand(configuration, 'admin', {
//           createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
//         }, function(err, r) {
//           test.equal(null, err);
//
//           executeCommand(configuration, 'test', {
//             createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
//           }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
//             test.equal(null, err);
//             // Attempt to connect
//             var server = new Server({
//               host: configuration.host, port: configuration.port, bson: new bson()
//             })
//
//             // Add event listeners
//             server.on('connect', function(_server) {
//               _server.insert('test.test', [{a:1}], function(err, r) {
//                 // console.dir(err)
//                 test.equal(null, err);
//
//                 // Logout pool
//                 _server.logout('test', function(err) {
//                   test.equal(null, err);
//
//                   _server.insert('test.test', [{a:1}], function(err, r) {
//                     test.ok(err != null);
//
//                     _server.destroy();
//                     // console.log("=================== " + Object.keys(Connection.connections()).length)
//                     test.equal(0, Object.keys(Connection.connections()).length);
//                     // console.log("============================ 5")
//                     Connection.disableConnectionAccounting();
//                     test.done();
//                   });
//                 });
//               });
//             });
//
//             // Start connection
//             server.connect({auth: [method, 'test', 'admin', 'admin']});
//           });
//         });
//       });
//     });
//   }
// }
//
// exports['Should correctly have server auth wait for logout to finish'] = {
//   metadata: { requires: { topology: "auth" } },
//
//   test: function(configuration, test) {
//     var Server = require('../../../lib2/topologies/server')
//       , Connection = require('../../../lib2/connection/connection')
//       , bson = require('bson').BSONPure.BSON
//       , Query = require('../../../lib2/connection/commands').Query;
//
//     // Enable connections accounting
//     Connection.enableConnectionAccounting();
//
//     // Restart instance
//     configuration.manager.restart(true).then(function() {
//       locateAuthMethod(configuration, function(err, method) {
//         test.equal(null, err);
//
//         executeCommand(configuration, 'admin', {
//           createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
//         }, function(err, r) {
//           test.equal(null, err);
//
//           executeCommand(configuration, 'test', {
//             createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
//           }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
//             test.equal(null, err);
//             // Attempt to connect
//             var server = new Server({
//               host: configuration.host, port: configuration.port, bson: new bson()
//             })
//
//             // Add event listeners
//             server.on('connect', function(_server) {
//               _server.insert('test.test', [{a:1}], function(err, r) {
//                 test.equal(null, err);
//
//                 // Logout pool
//                 _server.logout('test', function(err) {
//                   test.equal(null, err);
//                 });
//
//                 _server.auth(method, 'test', 'admin', 'admin', function(err, r) {
//                   test.equal(null, err);
//
//                   _server.insert('test.test', [{a:1}], function(err, r) {
//                     test.equal(null, err);
//
//                     _server.destroy();
//                     // console.log("=================== " + Object.keys(Connection.connections()).length)
//                     test.equal(0, Object.keys(Connection.connections()).length);
//                     Connection.disableConnectionAccounting();
//                     test.done();
//                   });
//                 });
//               });
//             });
//
//             // Start connection
//             server.connect({auth:[method, 'test', 'admin', 'admin']});
//           });
//         });
//       });
//     });
//   }
// }

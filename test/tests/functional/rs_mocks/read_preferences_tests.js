exports['Should correctly connect to a replicaset and select the correct tagged secondary server'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      ObjectId = configuration.require.BSON.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.BSON.Long,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "dc" }
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });
    });

    // Attempt to connect
    var server = new ReplSet([
      { host: 'localhost', port: 32000 },
      { host: 'localhost', port: 32001 },
      { host: 'localhost', port: 32002 }], {
        setName: 'rs',
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 2000,
        size: 1
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {
      // Set up a write
      function schedule() {
        setTimeout(function() {
          // Perform a find
          _server.command('test.test', {
              count: 'test.test'
            , batchSize: 2
          }, {
            readPreference: new ReadPreference('secondaryPreferred', {loc:'dc'})
          }, function(err, r) {
            test.equal(err, null);
            test.equal(32002, r.connection.port);

            primaryServer.destroy();
            firstSecondaryServer.destroy();
            secondSecondaryServer.destroy();
            server.destroy();
            running = false;

            test.done();
            return;
          });
        }, 500);
      }

      // Schedule an insert
      schedule();
    });

    server.connect();
  }
}

exports['Should correctly connect to a replicaset and select the primary server'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      ObjectId = configuration.require.BSON.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.BSON.Long,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "dc" }
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });
    });

    // Attempt to connect
    var server = new ReplSet([
      { host: 'localhost', port: 32000 },
      { host: 'localhost', port: 32001 },
      { host: 'localhost', port: 32002 }], {
        setName: 'rs',
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 2000,
        size: 1
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {
      // Set up a write
      function schedule() {
        setTimeout(function() {
          // Perform a find
          _server.command('test.test', {
              count: 'test.test'
            , batchSize: 2
          }, {
            readPreference: new ReadPreference('primaryPreferred')
          }, function(err, r) {
            test.equal(err, null);
            test.equal(32000, r.connection.port);

            primaryServer.destroy();
            firstSecondaryServer.destroy();
            secondSecondaryServer.destroy();
            server.destroy();
            running = false;

            test.done();
            return;
          });
        }, 500);
      }

      // Schedule an insert
      schedule();
    });

    server.connect();
  }
}

exports['Should correctly round robin secondary reads'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet,
      ObjectId = configuration.require.BSON.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.BSON.Long,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var secondSecondaryServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32002", "primary": "localhost:32000", "tags" : { "loc" : "dc" }
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield secondSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if(doc.count) {
            request.reply({ "waitedMS" : Long.ZERO, "n" : 1, "ok" : 1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });
    });

    // Attempt to connect
    var server = new ReplSet([
      { host: 'localhost', port: 32000 },
      { host: 'localhost', port: 32001 },
      { host: 'localhost', port: 32002 }], {
        setName: 'rs',
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 2000,
        size: 1
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {
      // Set up a write
      function schedule() {
        setTimeout(function() {
          // Perform a find
          _server.command('test.test', {
              count: 'test.test'
            , batchSize: 2
          }, {
            readPreference: new ReadPreference('secondary')
          }, function(err, r) {
            test.equal(err, null);
            test.equal(32002, r.connection.port);

            // Perform a find
            _server.command('test.test', {
                count: 'test.test'
              , batchSize: 2
            }, {
              readPreference: new ReadPreference('secondary')
            }, function(err, r) {
              test.equal(err, null);
              test.equal(32001, r.connection.port);

              // Perform a find
              _server.command('test.test', {
                  count: 'test.test'
                , batchSize: 2
              }, {
                readPreference: new ReadPreference('secondary')
              }, function(err, r) {
                test.equal(err, null);
                test.equal(32002, r.connection.port);

                primaryServer.destroy();
                firstSecondaryServer.destroy();
                secondSecondaryServer.destroy();
                server.destroy();
                running = false;

                test.done();
                return;
              });
            });
          });
        }, 500);
      }

      // Schedule an insert
      schedule();
    });

    server.connect();
  }
}

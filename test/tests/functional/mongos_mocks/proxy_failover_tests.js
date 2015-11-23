var timeoutPromise = function(timeout) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
}

exports['Should correctly failover due to proxy going away causing timeout'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(52000, 'localhost');
      mongos2 = yield mockupdb.createServer(52001, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            return mongos1.destroy();
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 52000 },
        { host: 'localhost', port: 52001 },
      ], {
      connectionTimeout: 3000,
      socketTimeout: 5000,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function(_server) {
      var intervalId = setInterval(function() {
        server.insert('test.test', [{created:new Date()}], function(err, r) {
          // If we have a successful insert
          // validate that it's the expected proxy
          if(r) {
            clearInterval(intervalId);
            test.equal(52001, r.connection.port);
            server.destroy();
            mongos1.destroy();
            mongos2.destroy();
            running = false;
            test.done();
          }
        })
      }, 500);
    });

    server.on('error', function(){});
    server.connect();
  }
}

exports['Should correctly bring back proxy and use it'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(52000, 'localhost');
      mongos2 = yield mockupdb.createServer(52001, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert && currentStep == 0) {
            yield timeoutPromise(1600);
            request.connection.destroy();
          } else if(doc.insert && currentStep == 1) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 5000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 52000 },
        { host: 'localhost', port: 52001 },
      ], {
      connectionTimeout: 3000,
      socketTimeout: 1500,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function(_server) {
      var intervalId = setInterval(function() {
        server.insert('test.test', [{created:new Date()}], function(err, r) {
          // If we have a successful insert
          // validate that it's the expected proxy
          if(r) {
            clearInterval(intervalId);
            test.equal(52001, r.connection.port);

            // Proxies seen
            var proxies = {};

            // Perform interval inserts waiting for both proxies to come back
            var intervalId2 = setInterval(function() {
              // Bring back the missing proxy
              if(currentStep == 0) currentStep = currentStep + 1;
              // Perform inserts
              server.insert('test.test', [{created:new Date()}], function(err, r) {
                if(r) {
                  proxies[r.connection.port] = true
                }

                // Do we have both proxies answering
                if(Object.keys(proxies).length == 2) {
                  clearInterval(intervalId2);

                  server.destroy();
                  mongos1.destroy();
                  mongos2.destroy();
                  running = false;
                  test.done();
                }
              });
            }, 500);
          }
        })
      }, 500);
    });

    server.on('error', function(){});
    server.connect();
  }
}

exports['Should correctly bring back both proxies and use it'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var mongos1 = null;
    var mongos2 = null;
    var running = true;
    // Current index for the ismaster
    var currentStep = 0;
    // Primary stop responding
    var stopRespondingPrimary = false;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Default message fields
    var defaultFields = {
      "ismaster" : true,
      "msg" : "isdbgrid",
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Primary server states
    var serverIsMaster = [extend(defaultFields, {})];
    // Boot the mock
    co(function*() {
      mongos1 = yield mockupdb.createServer(52000, 'localhost');
      mongos2 = yield mockupdb.createServer(52001, 'localhost');

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos1.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert && currentStep == 0) {
            yield timeoutPromise(1600);
            request.connection.destroy();
          } else if(doc.insert && currentStep == 1) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Mongos
      co(function*() {
        while(running) {
          var request = yield mongos2.receive();

          // Get the document
          var doc = request.document;
          if(doc.ismaster) {
            request.reply(serverIsMaster[0]);
          } else if(doc.insert && currentStep == 0) {
            yield timeoutPromise(1600);
            request.connection.destroy();
          } else if(doc.insert && currentStep == 1) {
            request.reply({ok:1, n:doc.documents, lastOp: new Date()});
          }
        }
      });

      // Start dropping the packets
      setTimeout(function() {
        stopRespondingPrimary = true;
        currentIsMasterState = 1;
      }, 1000);
    });

    // Attempt to connect
    var server = new Mongos([
        { host: 'localhost', port: 52000 },
        { host: 'localhost', port: 52001 },
      ], {
      connectionTimeout: 3000,
      socketTimeout: 500,
      haInterval: 1000,
      size: 1
    });

    // Add event listeners
    server.once('fullsetup', function(_server) {
      var intervalId = setInterval(function() {
        server.insert('test.test', [{created:new Date()}], function(err, r) {
          if(intervalId == null) return;
          // Clear out the interval
          clearInterval(intervalId);
          intervalId = null;
          // Let the proxies come back
          if(currentStep == 0) currentStep = currentStep + 1;

          // Proxies seen
          var proxies = {};

          // Perform interval inserts waiting for both proxies to come back
          var intervalId2 = setInterval(function() {
            // Perform inserts
            server.insert('test.test', [{created:new Date()}], function(err, r) {
              if(intervalId2 == null) return;
              if(r) {
                proxies[r.connection.port] = true
              }

              // Do we have both proxies answering
              if(Object.keys(proxies).length == 2) {
                clearInterval(intervalId2);
                intervalId2 = null;
                
                running = false;
                server.destroy();
                mongos1.destroy();
                mongos2.destroy();
                test.done();
              }
            });
          }, 100);
        })
      }, 500);
    });

    server.on('error', function(){});
    server.connect();
  }
}

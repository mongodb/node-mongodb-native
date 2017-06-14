"use strict";

exports['server should recieve list of client\'s supported compressors in handshake'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;

    // Prepare the server's response
    var serverResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37046, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          test.equal(request.response.documents[0].compression[0], 'snappy');
          test.equal(request.response.documents[0].compression[1], 'zlib');
          request.reply(serverResponse);
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37046',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib'], zlibCompressionLevel: -1},
    });

    client.on('connect', function() {
      client.destroy();
      running = false
      setTimeout(function () {
        test.done();
      }, 1000);
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

exports['should connect and insert document when server is responding with OP_COMPRESSED with no compression'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
    var currentStep = 0;

    // Prepare the server's response
    let serverResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37047, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');
            // Acknowledge connection using OP_COMPRESSED with no compression
            request.reply(serverResponse, { compression: { compressor: "no_compression"}});
          } else if (currentStep == 1) {
            // Acknowledge insertion using OP_COMPRESSED with no compression
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "no_compression"}});
          } else if (currentStep == 2 || currentStep == 3) {
            // Acknowledge update using OP_COMPRESSED with no compression
            request.reply({ok:1, n: 1}, { compression: { compressor: "no_compression"}});
          } else if (currentStep == 4) {
            request.reply({ok:1}, { compression: {compressor: "no_compression"}})
          }
          currentStep++;
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37047',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    // Connect and try inserting, updating, and removing
    // All outbound messages from the driver will be uncompressed
    // Inbound messages from the server should be OP_COMPRESSED with no compression
    client.on('connect', function(_server) {
      _server.insert('test.test', [{a:1, created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        _server.update('test.test', {q: {a: 1}, u: {'$set': {b: 1}}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          _server.remove('test.test', {q: {a: 1}}, function(err, r) {
            if (err) console.log(err)
            test.equal(null, err);
            test.equal(1, r.result.n);

            _server.command('system.$cmd', { ping: 1 }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.ok);

              client.destroy();
              setTimeout(function () {
                running = false
                test.done();
              }, 500);
            });
          })
        })

      })
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

exports['should connect and insert document when server is responding with OP_COMPRESSED with snappy compression'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
    var currentStep = 0;

    // Prepare the server's response
    var serverResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "compression": ['snappy'],
      "ok" : 1
    }

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37048, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');
            // Acknowledge connection using OP_COMPRESSED with snappy
            request.reply(serverResponse, { compression: { compressor: "snappy"}});
          } else if (currentStep == 1) {
            // Acknowledge insertion using OP_COMPRESSED with snappy
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "snappy"}});
          } else if (currentStep == 2 || currentStep == 3) {
            // Acknowledge update using OP_COMPRESSED with snappy
            request.reply({ok:1, n: 1}, { compression: { compressor: "snappy"}});
          } else if (currentStep == 4) {
            request.reply({ok:1}, { compression: {compressor: "snappy"}})
          }
          currentStep++;
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37048',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    // Connect and try inserting, updating, and removing
    // All outbound messages from the driver (after initial connection) will be OP_COMPRESSED using snappy
    // Inbound messages from the server should be OP_COMPRESSED with snappy
    client.on('connect', function(_server) {
      _server.insert('test.test', [{a:1, created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        _server.update('test.test', {q: {a: 1}, u: {'$set': {b: 1}}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          _server.remove('test.test', {q: {a: 1}}, function(err, r) {
            if (err) console.log(err)
            test.equal(null, err);
            test.equal(1, r.result.n);

            _server.command('system.$cmd', { ping: 1 }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.ok);

              client.destroy();
              setTimeout(function () {
                running = false
                test.done();
              }, 500);
            });
          })
        })

      })
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

exports['should connect and insert document when server is responding with OP_COMPRESSED with zlib compression'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
    var currentStep = 0;

    // Prepare the server's response
    var serverResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "compression": ['zlib'],
      "ok" : 1
    }

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37049, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');
            // Acknowledge connection using OP_COMPRESSED with zlib
            request.reply(serverResponse, { compression: { compressor: "zlib"}});
          } else if (currentStep == 1) {
            // Acknowledge insertion using OP_COMPRESSED with zlib
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "zlib"}});
          } else if (currentStep == 2 || currentStep == 3) {
            // Acknowledge update using OP_COMPRESSED with zlib
            request.reply({ok:1, n: 1}, { compression: { compressor: "zlib"}});
          } else if (currentStep == 4) {
            request.reply({ok:1}, { compression: {compressor: "zlib"}})
          }
          currentStep++;
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37049',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    // Connect and try inserting, updating, and removing
    // All outbound messages from the driver (after initial connection) will be OP_COMPRESSED using zlib
    // Inbound messages from the server should be OP_COMPRESSED with zlib
    client.on('connect', function(_server) {
      _server.insert('test.test', [{a:1, created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        _server.update('test.test', {q: {a: 1}, u: {'$set': {b: 1}}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          _server.remove('test.test', {q: {a: 1}}, function(err, r) {
            if (err) console.log(err)
            test.equal(null, err);
            test.equal(1, r.result.n);

            _server.command('system.$cmd', { ping: 1 }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.ok);

              client.destroy();
              setTimeout(function () {
                running = false
                test.done();
              }, 500);
            });
          })
        })

      })
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

exports['should not compress uncompressible commands'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
    var currentStep = 0;

    // Prepare the server's response
    var serverResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "compression": ['snappy'],
      "ok" : 1
    }

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37050, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');
            // Acknowledge connection using OP_COMPRESSED with snappy
            request.reply(serverResponse, { compression: { compressor: "snappy"}});
          } else if (currentStep == 1) {
            // Acknowledge ping using OP_COMPRESSED with snappy
            request.reply({ok:1}, { compression: {compressor: "snappy"}})
          } else if (currentStep >= 2) {
            // Acknowledge further uncompressible commands using OP_COMPRESSED with snappy
            request.reply({ok:1}, { compression: {compressor: "snappy"}})
          }
          currentStep++;
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37050',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    // Connect and try some commands, checking that uncompressible commands are indeed not compressed
    client.on('connect', function(_server) {
      _server.command('system.$cmd', { ping: 1 }, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.ok);

        _server.command('system.$cmd', { ismaster: 1 }, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.ok);

          _server.command('system.$cmd', { getnonce: 1 }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.ok);

            _server.command('system.$cmd', { ismaster: 1 }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.ok);

              client.destroy();
              setTimeout(function () {
                running = false
                test.done();
              }, 500);
            });
          });
        });
      });
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

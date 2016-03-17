"use strict";

// Extend the object
var extend = function(template, fields) {
  var object = {};
  for(var name in template) {
    object[name] = template[name];
  }

  for(var name in fields) {
   object[name] = fields[name];
  }

  return object;
}

exports['Successfully add a new secondary server to the set'] = {
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
    var arbiterServer = null;
    var running = true;
    var currentIsMasterIndex = 0;

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": new ObjectId(),
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" },
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002", "localhost:32003"], "setVersion": 2
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" },
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002", "localhost:32003"], "setVersion": 2
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32003", "primary": "localhost:32000", "tags" : { "loc" : "sf" },
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002", "localhost:32003"], "setVersion": 2
    })];

    // Primary server states
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    }),extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000",
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002", "localhost:32003"], "setVersion": 2
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32003, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[currentIsMasterIndex]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[currentIsMasterIndex]);
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
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Arbiter state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[currentIsMasterIndex]);
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

    server.on('joined', function(_type, _server) {
      if(_type == 'arbiter') {
        // test.equal(true, server.__connected);

        // test.equal(1, server.s.replState.secondaries.length);
        // test.equal('localhost:32001', server.s.replState.secondaries[0].name);

        // test.equal(1, server.s.replState.arbiters.length);
        // test.equal('localhost:32002', server.s.replState.arbiters[0].name);

        // test.ok(server.s.replState.primary != null);
        // test.equal('localhost:32000', server.s.replState.primary.name);

        // Flip the ismaster message
        currentIsMasterIndex = currentIsMasterIndex + 1;
      } else if(_type == 'secondary' && _server.name == 'localhost:32003') {
        // test.equal(true, server.__connected);

        test.equal(2, server.s.replState.secondaries.length);
        test.equal('localhost:32001', server.s.replState.secondaries[0].name);
        test.equal('localhost:32003', server.s.replState.secondaries[1].name);

        // test.equal(1, server.s.replState.arbiters.length);
        // test.equal('localhost:32002', server.s.replState.arbiters[0].name);

        test.ok(server.s.replState.primary != null);
        test.equal('localhost:32000', server.s.replState.primary.name);

        running = false;
        primaryServer.destroy();
        firstSecondaryServer.destroy();
        secondSecondaryServer.destroy();
        arbiterServer.destroy();
        server.destroy();
        test.done();
      }
    });

    server.on('error', function(){
    });

    server.on('connect', function(e) {
      server.__connected = true;
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {});

    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}

exports['Successfully remove a secondary server from the set'] = {
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
    var arbiterServer = null;
    var running = true;
    var currentIsMasterIndex = 0;

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": new ObjectId(),
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002", "localhost:32003"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" },
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "setVersion": 2
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" },
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "setVersion": 2
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32003", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), { "ismaster" : true,
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 3,
      "minWireVersion" : 0, "ok" : 1
    }];

    // Primary server states
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    }),extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000",
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "setVersion": 2
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32003, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[currentIsMasterIndex]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[currentIsMasterIndex]);
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
            request.reply(secondSecondary[currentIsMasterIndex]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Arbiter state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[currentIsMasterIndex]);
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

    // Joined
    var joined = 0;

    server.on('joined', function(_type, _server) {
      joined = joined + 1;

      // primary, secondary and arbiter have joined
      if(joined == 4) {
        test.equal(true, server.__connected);

        test.equal(2, server.s.replState.secondaries.length);
        test.equal('localhost:32001', server.s.replState.secondaries[0].name);
        test.equal('localhost:32003', server.s.replState.secondaries[1].name);

        test.equal(1, server.s.replState.arbiters.length);
        test.equal('localhost:32002', server.s.replState.arbiters[0].name);

        test.ok(server.s.replState.primary != null);
        test.equal('localhost:32000', server.s.replState.primary.name);

        // Flip the ismaster message
        currentIsMasterIndex = currentIsMasterIndex + 1;
      }
    });

    server.on('left', function(_type, _server) {
      if(_type == 'secondary' && _server.name == 'localhost:32003') {
        test.equal(true, server.__connected);

        test.equal(1, server.s.replState.secondaries.length);
        test.equal('localhost:32001', server.s.replState.secondaries[0].name);

        test.equal(1, server.s.replState.arbiters.length);
        test.equal('localhost:32002', server.s.replState.arbiters[0].name);

        test.ok(server.s.replState.primary != null);
        test.equal('localhost:32000', server.s.replState.primary.name);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        secondSecondaryServer.destroy();
        arbiterServer.destroy();
        server.destroy();
        running = false;

        test.done();
      }
    });

    server.on('error', function(){});

    server.on('connect', function(e) {
      server.__connected = true;
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {});
    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}

exports['Successfully remove a secondary server from the set then re-add it'] = {
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
    var arbiterServer = null;
    var running = true;
    var currentIsMasterIndex = 0;

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": new ObjectId(),
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 4,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002", "localhost:32003"], "arbiters": ["localhost:32002"]
    }

    // Primary server states
    var primary = [extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" },
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "setVersion": 2
    }), extend(defaultFields, {
      "ismaster":true, "secondary":false, "me": "localhost:32000", "primary": "localhost:32000", "tags" : { "loc" : "ny" }
    })];

    // Primary server states
    var firstSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" },
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "setVersion": 2
    }), extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32001", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    })];

    // Primary server states
    var secondSecondary = [extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32003", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    }), { "ismaster" : true,
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 3,
      "minWireVersion" : 0, "ok" : 1
    }, extend(defaultFields, {
      "ismaster":false, "secondary":true, "me": "localhost:32003", "primary": "localhost:32000", "tags" : { "loc" : "sf" }
    })];

    // Primary server states
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    }),extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000",
      "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "setVersion": 2
    }), extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      secondSecondaryServer = yield mockupdb.createServer(32003, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[currentIsMasterIndex]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[currentIsMasterIndex]);
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
            request.reply(secondSecondary[currentIsMasterIndex]);
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      // Arbiter state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[currentIsMasterIndex]);
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

    server.on('joined', function(_type, _server) {
      if(_type == 'arbiter') {
        currentIsMasterIndex = currentIsMasterIndex + 1;
      } else if(_type == 'secondary'
        && _server.name == 'localhost:32003' && currentIsMasterIndex == 2) {
        test.equal(true, server.__connected);

        test.equal(2, server.s.replState.secondaries.length);
        test.equal('localhost:32001', server.s.replState.secondaries[0].name);
        test.equal('localhost:32003', server.s.replState.secondaries[1].name);

        test.equal(1, server.s.replState.arbiters.length);
        test.equal('localhost:32002', server.s.replState.arbiters[0].name);

        test.ok(server.s.replState.primary != null);
        test.equal('localhost:32000', server.s.replState.primary.name);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        secondSecondaryServer.destroy();
        arbiterServer.destroy();
        server.destroy();
        running = false;

        test.done();
      }
    });

    server.on('error', function(){});

    server.on('left', function(_type, _server) {
      if(_type == 'secondary' && _server.name == 'localhost:32003') {
        test.equal(true, server.__connected);

        test.equal(1, server.s.replState.secondaries.length);
        test.equal('localhost:32001', server.s.replState.secondaries[0].name);

        test.equal(1, server.s.replState.arbiters.length);
        test.equal('localhost:32002', server.s.replState.arbiters[0].name);

        test.ok(server.s.replState.primary != null);
        test.equal('localhost:32000', server.s.replState.primary.name);

        // Flip the ismaster message
        currentIsMasterIndex = currentIsMasterIndex + 1;
      }
    });

    server.on('connect', function(e) {
      server.__connected = true;
    });

    // Add event listeners
    server.on('fullsetup', function(_server) {});
    // Gives proxies a chance to boot up
    setTimeout(function() {
      server.connect();
    }, 100)
  }
}

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

exports['Successfully pass through writeConcern to aggregate command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.aggregate) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.collection('test').aggregate([
          {$match: {}}
        , {$out:'readConcernCollectionAggregate1Output'}
      ], {w:2, wtimeout:1000}).toArray(function(err, r) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to create command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.listCollections) {
            request.reply({ok:1, cursor: {
              id: Long.fromNumber(0), ns: 'test.cmd$.listCollections', firstBatch: []
            }});
          } else if(doc.create) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.createCollection('test_collection_methods', {w:2, wtimeout: 1000}, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to createIndexes command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.createIndexes) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.collection('indexOptionDefault').createIndex({a:1}, {
        indexOptionDefaults: true, w:2, wtimeout: 1000
      }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to drop command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.drop) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.collection('indexOptionDefault').drop({
        w:2, wtimeout: 1000
      }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to dropDatabase command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.dropDatabase) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.dropDatabase({
        w:2, wtimeout: 1000
      }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to dropIndexes command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;
          console.log("========================== cmd")
          console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.dropIndexes) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.collection('test').dropIndexes({
        w:2, wtimeout: 1000
      }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to dropIndexes command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      Code = configuration.require.Code,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.mapreduce) {
            commandResult = doc;
            request.reply({ok:1, result:'tempCollection'});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      // String functions
      var map = new Code("function() { emit(this.user_id, 1); }");
      var reduce = new Code("function(k,vals) { return 1; }");

      // db.collection('test').mapReduce({
      db.collection('test').mapReduce(map, reduce, {
        out: {replace : 'tempCollection'},
        w:2, wtimeout: 1000
      }, function(err, r) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to createUser command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      Code = configuration.require.Code,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.createUser) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.admin().addUser('kay:kay', 'abc123', {w:2, wtimeout:1000}, function(err, result) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to dropUser command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      Code = configuration.require.Code,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.dropUser) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      db.admin().removeUser('kay:kay', {w:2, wtimeout:1000}, function(err, result) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

exports['Successfully pass through writeConcern to findAndModify command'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      ObjectId = configuration.require.ObjectId,
      ReadPreference = configuration.require.ReadPreference,
      Long = configuration.require.Long,
      Code = configuration.require.Code,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var primaryServer = null;
    var firstSecondaryServer = null;
    var arbiterServer = null;
    var running = true;
    var electionIds = [new ObjectId(), new ObjectId()];

    // Default message fields
    var defaultFields = {
      "setName": "rs", "setVersion": 1, "electionId": electionIds[0],
      "maxBsonObjectSize" : 16777216, "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000, "localTime" : new Date(), "maxWireVersion" : 5,
      "minWireVersion" : 0, "ok" : 1, "hosts": ["localhost:32000", "localhost:32001", "localhost:32002"], "arbiters": ["localhost:32002"]
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
    var arbiter = [extend(defaultFields, {
      "ismaster":false, "secondary":false, "arbiterOnly": true, "me": "localhost:32002", "primary": "localhost:32000"
    })];

    // Boot the mock
    co(function*() {
      primaryServer = yield mockupdb.createServer(32000, 'localhost');
      firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
      arbiterServer = yield mockupdb.createServer(32002, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield primaryServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.findandmodify) {
            commandResult = doc;
            request.reply({ok:1, result: {}});
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // First secondary state machine
      co(function*() {
        while(running) {
          var request = yield firstSecondaryServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });

      // Second secondary state machine
      co(function*() {
        while(running) {
          var request = yield arbiterServer.receive();
          var doc = request.document;

          if(doc.ismaster) {
            request.reply(arbiter[0]);
          }
        }
      }).catch(function(err) {
        // console.log(err.stack);
      });
    });

    var commandResult = null;

    // Connect to the mocks
    MongoClient.connect('mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs', function(err, db) {
      test.equal(null, err);

      // Simple findAndModify command returning the new document
      db.collection('test').findAndModify({a:1}, [['a', 1]], {$set:{b1:1}}, {new:true, w:2, wtimeout:1000}, function(err, doc) {
        test.equal(null, err);
        test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

        primaryServer.destroy();
        firstSecondaryServer.destroy();
        arbiterServer.destroy();
        running = false;

        db.close();
        test.done();
      });
    });
  }
}

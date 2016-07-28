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

exports['Successfully pass through collation to findAndModify command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
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
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').findAndModify({a:1}, [['a', 1]], {$set:{b1:1}}, {new:true, collation: {caseLevel:true}}, function(err, doc) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to count command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.count) {
            commandResult = doc;
            request.reply({ok:1, result: {n:1}});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').count({}, {collation: {caseLevel:true}}, function(err, doc) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to aggregation command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.aggregate) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').aggregate([
            {$match: {}}
          , {$out:'readConcernCollectionAggregate1Output'}
        ], {collation: {caseLevel:true}}).toArray(function(err, doc) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to distinct command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.distinct) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').distinct('a', {}, {collation: {caseLevel:true}}, function(err, doc) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to geoNear command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.geoNear) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').geoNear(50, 50, {query:{a:1}, num:1, collation: {caseLevel:true}}, function(err, doc) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to group command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.group) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }"
          , "function (obj, prev) { prev.count++; }"
          , true, {collation: {caseLevel:true}}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to mapreduce command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Code = configuration.require.Code,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
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
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // String functions
        var map = new Code("function() { emit(this.user_id, 1); }");
        var reduce = new Code("function(k,vals) { return 1; }");

        // db.collection('test').mapReduce({
        db.collection('test').mapReduce(map, reduce, {
          out: {replace : 'tempCollection'},
          collation: {caseLevel:true}
        }, function(err, r) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to remove command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.delete) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').deleteMany({}, {collation: {caseLevel:true}}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to update command'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.update) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').updateOne({a:1}, {$set:{b:1}}, {collation: {caseLevel:true}}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to find command via options'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').find({a:1}, {collation: {caseLevel:true}}).toArray(function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to find command via cursor'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').find({a:1}).collation({caseLevel:true}).toArray(function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to findOne'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').findOne({a:1}, {collation: { caseLevel: true }}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to findOne at collection level'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test', {collation: { caseLevel: true }}).findOne({a:1}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to findOne at db level'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.db('test2', {collation: { caseLevel: true }}).collection('test').findOne({a:1}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to findOne at MongoClient level'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', {collation: { caseLevel: true }}, function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').findOne({a:1}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Successfully pass through collation to createCollection'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Long = configuration.require.Long,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 5, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

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
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.createCollection('test', {collation: { caseLevel: true }}, function(err, results) {
          test.equal(null, err);
          test.deepEqual({ caseLevel: true }, commandResult.collation);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Fail due to no support for collation'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 4, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.collection('test').findOne({a:1}, {collation: { caseLevel: true }}, function(err, results) {
          test.equal('server localhost:32000 does not support collation', err.message);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Fail command due to no support for collation'] = {
  metadata: { requires: { generators: true, topology: "single" } },

  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      co = require('co'),
      mockupdb = require('../mock');

    // Contain mock server
    var singleServer = null;
    var running = true;

    // Default message fields
    var defaultFields = {
      "ismaster" : true, "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000, "maxWriteBatchSize" : 1000,
      "localTime" : new Date(), "maxWireVersion" : 4, "minWireVersion" : 0, "ok" : 1
    }

    // Primary server states
    var primary = [extend(defaultFields, {})];

    // Boot the mock
    co(function*() {
      singleServer = yield mockupdb.createServer(32000, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield singleServer.receive();
          var doc = request.document;
          // console.log("========================== cmd")
          // console.dir(doc)

          if(doc.ismaster) {
            request.reply(primary[0]);
          } else if(doc.find) {
            commandResult = doc;
            request.reply({ok:1});
          }
        }
      }).catch(function(err) {
        console.log(err.stack);
      });

      var commandResult = null;

      // Connect to the mocks
      MongoClient.connect('mongodb://localhost:32000/test', function(err, db) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        db.command({count: 'test', query: {}, collation: { caseLevel: true }}, function(err, results) {
          test.equal('server localhost:32000 does not support collation', err.message);

          singleServer.destroy();
          running = false;

          db.close();
          test.done();
        });
      });
    });
  }
}

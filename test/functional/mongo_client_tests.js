"use strict";

var f = require('util').format;

exports['Should Correctly Do MongoClient with bufferMaxEntries:0 and ordered execution'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single', 'ssl', 'wiredtiger']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {
      db: {bufferMaxEntries:0}, server: { sslValidate: false },
    }, function(err, db) {
      // Listener for closing event
      var closeListener = function(has_error) {
        // console.log("!!!!!!!!! closeListener")
        // Let's insert a document
        var collection = db.collection('test_object_id_generation.data2');
        // Insert another test document and collect using ObjectId
        var docs = [];
        for(var i = 0; i < 1500; i++) docs.push({a:i})

        // console.log("!!!!!!!!! closeListener 1")
        collection.insert(docs, configuration.writeConcern(), function(err, ids) {
          // console.log("!!!!!!!!! closeListener 2")
          test.ok(err != null);
          test.ok(err.message.indexOf("0") != -1)
          // Let's close the db
          db.close();
          test.done();
        });
      };

      // Add listener to close event
      db.once("close", closeListener);
      // Ensure death of server instance
      db.serverConfig.connections()[0].destroy();
    });
  }
}

exports['Should Correctly Do MongoClient with bufferMaxEntries:0 and unordered execution'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single', 'ssl', 'wiredtiger']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {
      db: {bufferMaxEntries:0}, server: { sslValidate: false },
    }, function(err, db) {
      // Listener for closing event
      var closeListener = function(has_error) {
        // Let's insert a document
        var collection = db.collection('test_object_id_generation.data_3');
        // Insert another test document and collect using ObjectId
        var docs = [];
        for(var i = 0; i < 1500; i++) docs.push({a:i})

        var opts = configuration.writeConcern();
        opts.keepGoing = true;
        // Execute insert
        collection.insert(docs, opts, function(err, ids) {
          test.ok(err != null);
          test.ok(err.message.indexOf("0") != -1)
          // Let's close the db
          db.close();
          test.done();
        });
      };

      // Add listener to close event
      db.once("close", closeListener);
      // Ensure death of server instance
      db.serverConfig.connections()[0].destroy();
    });
  }
}

exports['Should correctly pass through extra db options'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {
      db: {
          w: 1
        , wtimeout: 1000
        , fsync: true
        , j:true
        , readPreference:'nearest'
        , readPreferenceTags: {'loc': 'ny'}
        , native_parser: false
        , forceServerObjectId: true
        , pkFactory: function() { return 1 }
        , serializeFunctions: true
        , raw: true
        , retryMiliSeconds: 1000
        , numberOfRetries: 10
        , bufferMaxEntries: 0
      },
    }, function(err, db) {
      test.equal(1, db.writeConcern.w);
      test.equal(1000, db.writeConcern.wtimeout);
      test.equal(true, db.writeConcern.fsync);
      test.equal(true, db.writeConcern.j);

      test.equal('nearest', db.s.readPreference.mode);
      test.deepEqual({'loc': 'ny'}, db.s.readPreference.tags);

      test.equal(false, db.s.nativeParser);
      test.equal(true, db.s.options.forceServerObjectId);
      test.equal(1, db.s.pkFactory());
      test.equal(true, db.s.options.serializeFunctions);
      test.equal(true, db.s.options.raw);
      test.equal(1000, db.s.options.retryMiliSeconds);
      test.equal(10, db.s.options.numberOfRetries);
      test.equal(0, db.s.options.bufferMaxEntries);

      db.close();
      test.done();
    });
  }
}

exports['Should correctly pass through extra server options'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {
      server: {
          poolSize: 10
        , autoReconnect:false
        , socketOptions: {
            noDelay: false
          , keepAlive: 100
          , connectTimeoutMS: 444444
          , socketTimeoutMS: 555555
        }
      },
    }, function(err, db) {
      test.equal(10, db.s.topology.s.poolSize);
      test.equal(false, db.s.topology.autoReconnect);
      test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
      test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
      test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
      test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

      db.close();
      test.done();
    });
  }
}

exports['Should correctly pass through extra replicaset options'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['replicaset']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url().replace('rs_name=rs', 'rs_name=rs1')
    MongoClient.connect(url, {
      replSet: {
          ha:false
        , haInterval: 10000
        , replicaSet: 'rs'
        , secondaryAcceptableLatencyMS: 100
        , connectWithNoPrimary: true
        , poolSize: 1
        , socketOptions: {
            noDelay: false
          , keepAlive: 100
          , connectTimeoutMS: 444444
          , socketTimeoutMS: 555555
        }
      }
    }, function(err, db) {
      test.equal(false, db.s.topology.s.clonedOptions.ha);
      test.equal(10000, db.s.topology.s.clonedOptions.haInterval);
      test.equal('rs', db.s.topology.s.clonedOptions.setName);
      test.equal(100, db.s.topology.s.clonedOptions.acceptableLatency);
      test.equal(true, db.s.topology.s.clonedOptions.secondaryOnlyConnectionAllowed);
      test.equal(1, db.s.topology.s.clonedOptions.size);

      test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
      test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
      test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
      test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

      db.close();
      test.done();
    });
  }
}

exports['Should correctly pass through extra sharded options'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['sharded']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {
      mongos: {
          ha:false
        , haInterval: 10000
        , acceptableLatencyMS: 100
        , poolSize: 1
        , socketOptions: {
            noDelay: false
          , keepAlive: 100
          , connectTimeoutMS: 444444
          , socketTimeoutMS: 555555
        }
      }
    }, function(err, db) {
      console.log("============================================")
      console.dir(err)
      console.dir(db.s.topology.s.clonedOptions)

      test.equal(false, db.s.topology.s.clonedOptions.ha);
      test.equal(10000, db.s.topology.s.clonedOptions.haInterval);
      test.equal(100, db.s.topology.s.clonedOptions.localThresholdMS);
      test.equal(1, db.s.topology.s.clonedOptions.poolSize);

      test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
      test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
      test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
      test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

      db.close();
      test.done();
    });
  }
}

exports['Should correctly set MaxPoolSize on single server'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url, function(err, db) {
      test.equal(1, db.serverConfig.connections().length);
      test.equal(100, db.serverConfig.s.server.s.pool.size);

      db.close();
      test.done();
    });
  }
}

exports['Should correctly set MaxPoolSize on replicaset server'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['replicaset']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url, {}, function(err, db) {
      // console.log("============================= 0")
      // console.dir(db.serverConfig.connections().length)
      test.ok(db.serverConfig.connections().length >= 1);

      // db.on('all', function() {
        // console.log("============================= 1")
        var connections = db.serverConfig.connections();

        for(var i = 0; i < connections.length; i++) {
          test.equal(120000, connections[i].connectionTimeout);
          test.equal(120000, connections[i].socketTimeout);
        }

        // console.log("============================= 2")

        db.close();

        MongoClient.connect(url, {
          connectTimeoutMS: 15000,
          socketTimeoutMS: 30000
        }, function(err, db) {
          // console.log("============================= 3")
          test.ok(db.serverConfig.connections().length >= 1);
          // console.log("============================= 4")

          // db.on('all', function() {
            // console.log("============================= 5")
            var connections = db.serverConfig.connections();

            // console.log("============================= 6")

            for(var i = 0; i < connections.length; i++) {
              test.equal(15000, connections[i].connectionTimeout);
              test.equal(30000, connections[i].socketTimeout);
            }

            // console.log("============================= 7")

            db.close();
            test.done();
          // });
        });
      // });
    });
  }
}

exports['Should correctly set MaxPoolSize on sharded server'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['sharded']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url, function(err, db) {
      test.ok(db.serverConfig.connections().length >= 1);

      db.close();
      test.done();
    });
  }
}

/**
 * @ignore
 */
exports['Should fail due to wrong uri user:password@localhost'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    try {
      MongoClient.connect('user:password@localhost:27017/test', function(err, db) {
        db.close();
      });
    } catch(err) {
      test.done();
    }
  }
}

// /**
//  * @ignore
//  */
// exports["correctly timeout MongoClient connect using custom connectTimeoutMS"] = {
//   metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
//
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var MongoClient = configuration.require.MongoClient;
//
//     var start = new Date();
//
//     MongoClient.connect('mongodb://example.com/test?connectTimeoutMS=1000&maxPoolSize=1', function(err, db) {
//       test.ok(err != null);
//       test.ok((new Date().getTime() - start.getTime()) >= 1000)
//       test.done();
//     });
//   }
// }

/**
 * @ignore
 */
exports["correctly error out when no socket available on MongoClient.connect"] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect('mongodb://localhost:27088/test', function(err, db) {
      test.ok(err != null);

      test.done();
    });
  }
}

/**
 * @ignore
 */
exports["correctly error out when no socket available on MongoClient.connect with domain"] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    MongoClient.connect('mongodb://test.com:80/test', function(err, db) {
      test.ok(err != null);

      test.done();
    });
  }
}

/**
 * @ignore
 */
exports["correctly connect setting keepAlive to 100"] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {
      keepAlive: 100
    }, function(err, db) {
      test.equal(null, err);
      var connection = db.serverConfig.connections()[0];
      test.equal(true, connection.keepAlive);
      test.equal(100, connection.keepAliveInitialDelay);

      db.close();

      MongoClient.connect(configuration.url(), {
        keepAlive: 0
      }, function(err, db) {
        test.equal(null, err);

        db.serverConfig.connections().forEach(function(x) {
          test.equal(false, x.keepAlive);
        })

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports["default keepAlive behavior"] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    MongoClient.connect(configuration.url(), {
    }, function(err, db) {
      test.equal(null, err);

      db.serverConfig.connections().forEach(function(x) {
        test.equal(true, x.keepAlive);
      });

      db.close();
      test.done();
    });
  }
}

exports['should fail dure to garbage connection string'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect('mongodb://unknownhost:36363/ddddd', {
    }, function(err, db) {
      test.ok(err != null);
      test.done();
    });
  }
}

exports['Should fail to connect due to instances not being mongos proxies'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['replicaset']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url()
      .replace('rs_name=rs', '')
      .replace('localhost:31000', 'localhost:31000,localhost:31001');
    MongoClient.connect(url, function(err, db) {
      test.ok(err != null);
      test.done();
    });
  }
}

exports['Should correctly pass through appname'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single', 'replicaset', 'sharded']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    if(url.indexOf('rs_name') != -1) {
      url = f('%s&appname=hello%20world', configuration.url());
    } else {
      url = f('%s?appname=hello%20world', configuration.url());
    }

    // var url = f('%s?appname=hello%20world', configuration.url());
    // console.dir(url)
    MongoClient.connect(url, function(err, db) {
      test.equal(null, err);
      test.equal('hello world', db.serverConfig.clientInfo.application.name);

      db.close();
      test.done();
    });
  }
}

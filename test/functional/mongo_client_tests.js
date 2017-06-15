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
    }, function(err, client) {
      var db = client.db(configuration.database);
      // Listener for closing event
      var closeListener = function(has_error) {
        // Let's insert a document
        var collection = db.collection('test_object_id_generation.data2');
        // Insert another test document and collect using ObjectId
        var docs = [];
        for(var i = 0; i < 1500; i++) docs.push({a:i})

        collection.insert(docs, configuration.writeConcern(), function(err, ids) {
          test.ok(err != null);
          test.ok(err.message.indexOf("0") != -1)
          // Let's close the db
          client.close();
          test.done();
        });
      };

      // Add listener to close event
      db.once("close", closeListener);
      // Ensure death of server instance
      client.topology.connections()[0].destroy();
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
    }, function(err, client) {
      var db = client.db(configuration.database);
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
          client.close();
          test.done();
        });
      };

      // Add listener to close event
      db.once("close", closeListener);
      // Ensure death of server instance
      client.topology.connections()[0].destroy();
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
    }, function(err, client) {
      var db = client.db(configuration.database);
      console.dir(db.writeConcern)

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

      client.close();
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
    }, function(err, client) {
      var db = client.db(configuration.database);

      test.equal(10, db.s.topology.s.poolSize);
      test.equal(false, db.s.topology.autoReconnect);
      test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
      test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
      test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
      test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

      client.close();
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
    }, function(err, client) {
      var db = client.db(configuration.database);

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

      client.close();
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
    }, function(err, client) {
      var db = client.db(configuration.database);

      test.equal(false, db.s.topology.s.clonedOptions.ha);
      test.equal(10000, db.s.topology.s.clonedOptions.haInterval);
      test.equal(100, db.s.topology.s.clonedOptions.localThresholdMS);
      test.equal(1, db.s.topology.s.clonedOptions.poolSize);

      test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
      test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
      test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
      test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

      client.close();
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

    MongoClient.connect(url, function(err, client) {
      var db = client.db(configuration.database);

      test.equal(1, client.topology.connections().length);
      test.equal(100, client.topology.s.server.s.pool.size);

      client.close();
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

    MongoClient.connect(url, {}, function(err, client) {
      var db = client.db(configuration.database);
      test.ok(client.topology.connections().length >= 1);

      var connections = client.topology.connections();

      for(var i = 0; i < connections.length; i++) {
        test.equal(30000, connections[i].connectionTimeout);
        test.equal(360000, connections[i].socketTimeout);
      }

      client.close();

      MongoClient.connect(url, {
        connectTimeoutMS: 15000,
        socketTimeoutMS: 30000
      }, function(err, client) {
        test.ok(client.topology.connections().length >= 1);

        var connections = client.topology.connections();

        for(var i = 0; i < connections.length; i++) {
          test.equal(15000, connections[i].connectionTimeout);
          test.equal(30000, connections[i].socketTimeout);
        }

        client.close();
        test.done();
      });
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

    MongoClient.connect(url, function(err, client) {
      var db = client.db(configuration.database);
      test.ok(client.topology.connections().length >= 1);

      client.close();
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
      MongoClient.connect('user:password@localhost:27017/test', function(err, client) {
        client.close();
      });
    } catch(err) {
      test.done();
    }
  }
}

/**
 * @ignore
 */
exports["correctly error out when no socket available on MongoClient.connect"] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect('mongodb://localhost:27088/test', function(err, client) {
      test.ok(err != null);

      test.done();
    });
  }
}

exports["should correctly connect to mongodb using domain socket"] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect('mongodb://%2Ftmp%2Fmongodb-27017.sock/test', function(err, client) {
      test.equal(null, err);
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

    MongoClient.connect('mongodb://test.com:80/test', function(err, client) {
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
    }, function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);
      var connection = client.topology.connections()[0];
      test.equal(true, connection.keepAlive);
      test.equal(100, connection.keepAliveInitialDelay);

      client.close();

      MongoClient.connect(configuration.url(), {
        keepAlive: false
      }, function(err, client) {
        test.equal(null, err);

        client.topology.connections().forEach(function(x) {
          test.equal(false, x.keepAlive);
        })

        client.close();
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
    }, function(err, client) {
      test.equal(null, err);
      var db = client.db(configuration.database);

      client.topology.connections().forEach(function(x) {
        test.equal(true, x.keepAlive);
      });

      client.close();
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
    }, function(err, client) {
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
    MongoClient.connect(url, function(err, client) {
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

    MongoClient.connect(url, function(err, client) {
      var db = client.db(configuration.database);
      test.equal(null, err);
      test.equal('hello world', client.topology.clientInfo.application.name);

      client.close();
      test.done();
    });
  }
}

exports['Should correctly pass through appname in options'] = {
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

    // console.dir(url)
    MongoClient.connect(url, {appname: 'hello world'}, function(err, db) {
      test.equal(null, err);
      test.equal('hello world', db.serverConfig.clientInfo.application.name);

      db.close();
      test.done();
    });
  }
}

exports['Should correctly pass through socketTimeoutMS and connectTimeoutMS'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single', 'replicaset', 'sharded']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {
      socketTimeoutMS: 0,
      connectTimeoutMS: 0
    }, function(err, client) {
      test.equal(null, err);
      var db = client.db(configuration.database);

      if(db.s.topology.s.clonedOptions) {
        test.equal(0, db.s.topology.s.clonedOptions.connectionTimeout);
        test.equal(0, db.s.topology.s.clonedOptions.socketTimeout);
      } else {
        test.equal(0, db.s.topology.s.options.connectionTimeout);
        test.equal(0, db.s.topology.s.options.socketTimeout);
      }

      client.close();
      test.done();
    });
  }
}

exports['Should correctly pass through socketTimeoutMS and connectTimeoutMS from uri'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var uri = f("%s?socketTimeoutMS=120000&connectTimeoutMS=15000", configuration.url());

    MongoClient.connect(uri, {
    }, function(err, client) {
      test.equal(null, err);
      var db = client.db(configuration.database);
      test.equal(120000, client.topology.s.server.s.options.socketTimeout);
      test.equal(15000, client.topology.s.server.s.options.connectionTimeout);

      client.close();
      test.done();
    });
  }
}

//////////////////////////////////////////////////////////////////////////////////////////
//
// new MongoClient connection tests
//
//////////////////////////////////////////////////////////////////////////////////////////
exports['Should open a new MongoClient connection'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    new MongoClient(configuration.url()).connect(function(err, mongoclient) {
      test.equal(null, err);

      mongoclient
        .db('integration_tests')
        .collection('new_mongo_client_collection')
        .insertOne({a:1}, function(err, r) {
          test.equal(null, err);
          test.ok(r);

          mongoclient.close();
          test.done();
        });
    });
  }
}

exports['Should open a new MongoClient connection using promise'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    new MongoClient(configuration.url())
      .connect()
      .then(function(mongoclient) {
        mongoclient
          .db('integration_tests')
          .collection('new_mongo_client_collection')
          .insertOne({a:1}).then(function(r) {
            test.ok(r);

            mongoclient.close();
            test.done();
          });
      });
  }
}


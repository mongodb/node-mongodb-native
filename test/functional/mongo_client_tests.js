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
        // Let's insert a document
        var collection = db.collection('test_object_id_generation.data2');
        // Insert another test document and collect using ObjectId
        var docs = [];
        for(var i = 0; i < 1500; i++) docs.push({a:i})

        collection.insert(docs, configuration.writeConcern(), function(err, ids) {
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
      test.equal('rs', db.s.topology.s.clonedOptions.replicaSet);
      test.equal(100, db.s.topology.s.clonedOptions.acceptableLatency);
      test.equal(true, db.s.topology.s.clonedOptions.secondaryOnlyConnectionAllowed);
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
        , secondaryAcceptableLatencyMS: 100
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
      test.equal(100, db.s.topology.s.clonedOptions.acceptableLatency);
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
      test.equal(100, db.serverConfig.connections().length);

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

    MongoClient.connect(url, function(err, db) {
      test.ok(db.serverConfig.connections().length >= 100);

      db.close();
      test.done();
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
      test.ok(db.serverConfig.connections().length >= 100);

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

/**
 * @ignore
 */
exports["correctly timeout MongoClient connect using custom connectTimeoutMS"] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    var start = new Date();

    MongoClient.connect('mongodb://example.com/test?connectTimeoutMS=1000&maxPoolSize=1', function(err, db) {
      // db.close();

      var end = new Date();
      console.dir(end.getTime() - start.getTime())

      test.done();
    });
  }
}

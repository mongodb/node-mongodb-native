'use strict';

var f = require('util').format;

exports['Should correctly connect with MongoClient.connect using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1
        ? f('%s&%s', url, 'maxPoolSize=100')
        : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url).then(function(client) {
      test.equal(1, client.topology.connections().length);

      client.close();
      test.done();
    });
  }
};

exports['Should correctly connect using Db.open and promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance({ w: 1 }, { poolSize: 1 });
    client.connect().then(function(client) {
      client.close();
      test.done();
    });
  }
};

exports['Should correctly execute ismaster using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      // Execute ismaster
      client.db(configuration.database).command({ ismaster: true }).then(function(result) {
        test.ok(result != null);

        client.close();
        test.done();
      });
    });
  }
};

exports['Should correctly catch command error using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      // Execute ismaster
      client
        .db(configuration.database)
        .command({ nosuchcommand: true })
        .then(function(result) {})
        .catch(function(err) {
          // Execute close using promise
          client.close().then(function() {
            test.done();
          });
        });
    });
  }
};

exports['Should correctly createCollecton using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      client
        .db(configuration.database)
        .createCollection('promiseCollection')
        .then(function(col) {
          test.ok(col != null);

          client.close();
          test.done();
        })
        .catch(function(err) {
          console.log(err.stack);
        });
    });
  }
};

exports['Should correctly execute stats using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      client.db(configuration.database).stats().then(function(stats) {
        test.ok(stats != null);

        client.close();
        test.done();
      });
    });
  }
};

exports['Should correctly execute eval using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      client
        .db(configuration.database)
        .eval('function (x) {return x;}', [3], { nolock: true })
        .then(function(result) {
          test.ok(result != null);

          client.close();
          test.done();
        });
    });
  }
};

exports['Should correctly rename and drop collection using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      var db = client.db(configuration.database);

      db.createCollection('promiseCollection1').then(function(col) {
        test.ok(col != null);
        var db = client.db(configuration.database);

        // console.log("--- 0")
        db.renameCollection('promiseCollection1', 'promiseCollection2').then(function(col) {
          // console.log("--- 1")
          test.ok(col != null);

          db.dropCollection('promiseCollection2').then(function(r) {
            // console.log("--- 2")
            test.ok(r);

            client.close();
            test.done();
          });
        });
      });
    });
  }
};

exports['Should correctly drop database using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      client
        .db(configuration.database)
        .dropDatabase()
        .then(function(r) {
          test.ok(r);

          client.close();
          test.done();
        })
        .catch(function(e) {
          console.dir(e);
        });
    });
  }
};

exports['Should correctly createCollections and call collections with Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      var db = client.db(configuration.database);

      db.createCollection('promiseCollectionCollections1').then(function(col) {
        test.ok(col != null);

        db.createCollection('promiseCollectionCollections2').then(function(col) {
          test.ok(col != null);

          db.collections().then(function(r) {
            test.ok(Array.isArray(r));

            client.close();
            test.done();
          });
        });
      });
    });
  }
};

exports['Should correctly execute executeDbAdminCommand using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      client.db(configuration.database).executeDbAdminCommand({ ismaster: true }).then(function(r) {
        test.ok(r);

        client.close();
        test.done();
      });
    });
  }
};

exports['Should correctly execute creatIndex using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      // Create an index
      client
        .db(configuration.database)
        .createIndex('promiseCollectionCollections1', { a: 1 })
        .then(function(r) {
          test.ok(r != null);

          client.close();
          test.done();
        });
    });
  }
};

exports['Should correctly execute ensureIndex using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url =
      url.indexOf('?') != -1 ? f('%s&%s', url, 'maxPoolSize=5') : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(client) {
      // Create an index
      client
        .db(configuration.database)
        .ensureIndex('promiseCollectionCollections2', { a: 1 })
        .then(function(r) {
          test.ok(r != null);

          client.close();
          test.done();
        });
    });
  }
};

exports['Should correctly execute createCollection using passed down bluebird Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: '>0.8.0',
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var db = null;
    var client = null;
    var BlueBird = require('bluebird');

    MongoClient.connect(configuration.url(), { promiseLibrary: BlueBird })
      .then(function(_client) {
        client = _client;
        db = client.db(configuration.database);
        return db.createCollection('test');
      })
      .then(function(col) {
        test.ok(col.s.options.promiseLibrary != null);

        client.close();
        test.done();
      });
  }
};

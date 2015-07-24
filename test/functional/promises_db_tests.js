"use strict";

var f = require('util').format;

exports['Should correctly connect with MongoClient.connect using Promise'] = {
  metadata: {
    requires: {
      promises: true,
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

    MongoClient.connect(url).then(function(db) {
      test.equal(100, db.serverConfig.connections().length);

      db.close();
      test.done();
    });
  }
}

exports['Should correctly connect using Db.open and promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open().then(function(db) {
      db.close();
      test.done();
    });
  }
}

exports['Should correctly execute ismaster using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      // Execute ismaster
      db.command({ismaster:true}).then(function(result) {
        test.ok(result != null);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly catch command error using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      // Execute ismaster
      db.command({nosuchcommand:true}).then(function(result) {
      }).catch(function(err) {

        // Execute close using promise
        db.close().then(function() {
          test.done();
        });
      });
    });
  }
}

exports['Should correctly createCollecton using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      db.createCollection('promiseCollection').then(function(col) {
        test.ok(col != null);

        db.close();
        test.done();
      }).catch(function(err) {
        console.log(err.stack)
      });
    });
  }
}

exports['Should correctly execute stats using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      db.stats().then(function(stats) {
        test.ok(stats != null);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly execute eval using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      db.eval('function (x) {return x;}', [3], {nolock:true}).then(function(result) {
        test.ok(result != null);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly rename and drop collection using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      db.createCollection('promiseCollection1').then(function(col) {
        test.ok(col != null);

        db.renameCollection('promiseCollection1', 'promiseCollection2').then(function(col) {
          test.ok(col != null);

          db.dropCollection('promiseCollection2').then(function(r) {
            test.ok(r);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports['Should correctly drop database using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      db.dropDatabase().then(function(r) {
        test.ok(r);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly createCollections and call collections with Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      db.createCollection('promiseCollectionCollections1').then(function(col) {
        test.ok(col != null);

        db.createCollection('promiseCollectionCollections2').then(function(col) {
          test.ok(col != null);

          db.collections().then(function(r) {
            test.ok(Array.isArray(r));

            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports['Should correctly execute executeDbAdminCommand using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      db.executeDbAdminCommand({ismaster:true}).then(function(r) {
        test.ok(r);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly execute creatIndex using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      // Create an index
      db.createIndex('promiseCollectionCollections1', {a:1}).then(function(r) {
        test.ok(r != null);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly execute ensureIndex using Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=5')
      : f('%s?%s', url, 'maxPoolSize=5');

    MongoClient.connect(url).then(function(db) {
      // Create an index
      db.ensureIndex('promiseCollectionCollections2', {a:1}).then(function(r) {
        test.ok(r != null);

        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly execute createCollection using passed down bluebird Promise'] = {
  metadata: {
    requires: {
      promises: true,
      node: ">0.8.0",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var db = null;
    var BlueBird = require('bluebird');

    MongoClient.connect(configuration.url(), {promiseLibrary: BlueBird}).then(function(conn) {
      db = conn;
      return db.createCollection('test');
    }).then(function(col) {
      test.ok(col.s.options.promiseLibrary != null);

      db.close();
      test.done();
    });
  }
}

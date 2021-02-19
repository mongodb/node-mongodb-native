'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var f = require('util').format;

class CustomPromise extends Promise {}
CustomPromise.prototype.isCustomMongo = true;

describe('Promises (Db)', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly connect with MongoClient `connect` using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function () {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      return client.connect().then(() => client.close());
    }
  });

  it('Should correctly connect using Db.open and promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
      client.connect().then(function (client) {
        client.close(done);
      });
    }
  });

  it('Should correctly execute ismaster using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        // Execute ismaster
        client
          .db(configuration.db)
          .command({ ismaster: true })
          .then(function (result) {
            test.ok(result !== null);

            client.close(done);
          });
      });
    }
  });

  it('Should correctly catch command error using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        // Execute ismaster
        client
          .db(configuration.db)
          .command({ nosuchcommand: true })
          .then(function () {})
          .catch(function () {
            // Execute close using promise
            client.close().then(function () {
              done();
            });
          });
      });
    }
  });

  it('Should correctly createCollection using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        client
          .db(configuration.db)
          .createCollection('promiseCollection')
          .then(function (col) {
            test.ok(col != null);

            client.close(done);
          })
          .catch(function (err) {
            test.ok(err != null);
          });
      });
    }
  });

  it('Should correctly execute stats using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        client
          .db(configuration.db)
          .stats()
          .then(function (stats) {
            test.ok(stats != null);

            client.close(done);
          });
      });
    }
  });

  it('Should correctly rename and drop collection using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        var db = client.db(configuration.db);

        db.createCollection('promiseCollection1').then(function (col) {
          test.ok(col != null);
          var db = client.db(configuration.db);

          db.renameCollection('promiseCollection1', 'promiseCollection2').then(function (col) {
            test.ok(col != null);

            db.dropCollection('promiseCollection2').then(function (r) {
              test.ok(r);

              client.close(done);
            });
          });
        });
      });
    }
  });

  it('Should correctly drop database using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        client
          .db(configuration.db)
          .dropDatabase()
          .then(function (r) {
            test.ok(r);

            client.close(done);
          })
          .catch(function (e) {
            test.ok(e != null);
          });
      });
    }
  });

  it('Should correctly createCollections and call collections with Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        var db = client.db(configuration.db);

        db.createCollection('promiseCollectionCollections1').then(function (col) {
          test.ok(col != null);

          db.createCollection('promiseCollectionCollections2').then(function (col) {
            test.ok(col != null);

            db.collections().then(function (r) {
              test.ok(Array.isArray(r));

              client.close(done);
            });
          });
        });
      });
    }
  });

  it('Should correctly execute createIndex using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        // Create an index
        client
          .db(configuration.db)
          .createIndex('promiseCollectionCollections1', { a: 1 })
          .then(function (r) {
            test.ok(r != null);

            client.close(done);
          });
      });
    }
  });

  it('Should correctly execute ensureIndex using Promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=5')
          : f('%s?%s', url, 'maxPoolSize=5');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        // Create an index
        client
          .db(configuration.db)
          .createIndex('promiseCollectionCollections2', { a: 1 })
          .then(function (r) {
            test.ok(r != null);

            client.close(done);
          });
      });
    }
  });
});

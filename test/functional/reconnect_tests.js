'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Reconnect', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly stop reconnection attempts after limit reached', {
    metadata: { requires: { topology: ['single'] }, ignore: { travis: true } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      var client = configuration.newClient(
        { w: 1 },
        {
          poolSize: 1,
          auto_reconnect: true,
          reconnectTries: 2,
          reconnectInterval: 100
        }
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Now let's stop the server
        configuration.manager.stop().then(function() {
          db.collection('waiting_for_reconnect').insert({ a: 1 }, function(err) {
            test.ok(err != null);
            client.close();

            configuration.manager.start().then(function() {
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly recover when bufferMaxEntries: -1 and multiple restarts', {
    metadata: { requires: { topology: ['single'] }, ignore: { travis: true } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      const client = configuration.newClient('mongodb://localhost:27017/test', {
        db: { native_parser: true, bufferMaxEntries: -1 },
        server: {
          poolSize: 20,
          socketOptions: { autoReconnect: true, keepAlive: true, keepAliveInitialDelay: 50 },
          reconnectTries: 1000,
          reconnectInterval: 1000
        }
      });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var col = db.collection('t');
        var count = 1;

        var execute = function() {
          if (!done) {
            col.insertOne({ a: 1, count: count }, function(err) {
              test.equal(null, err);
              count = count + 1;

              col.findOne({}, function(err) {
                test.equal(null, err);
                setTimeout(execute, 500);
              });
            });
          } else {
            col.insertOne({ a: 1, count: count }, function(err) {
              test.equal(null, err);

              col.findOne({}, function(err) {
                test.equal(null, err);
                client.close();
                done();
              });
            });
          }
        };

        setTimeout(execute, 500);
      });

      var count = 2;

      var restartServer = function() {
        if (count === 0) {
          done = true;
          return;
        }

        count = count - 1;

        configuration.manager.stop().then(function() {
          setTimeout(function() {
            configuration.manager.start().then(function() {
              setTimeout(restartServer, 1000);
            });
          }, 2000);
        });
      };

      setTimeout(restartServer, 1000);
    }
  });
});

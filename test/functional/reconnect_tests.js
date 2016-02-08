/**
 * @ignore
 */
exports['Should correctly stop reconnection attempts after limit reached'] = {
  metadata: { requires: { topology: ['single'] }, ignore: { travis:true } },

  // The actual test we wish to run
  test: function(configuration, test) {
    // Create a new db instance
    var db = configuration.newDbInstance({w:1}, {
        poolSize:1
      , auto_reconnect:true
      , reconnectTries: 2
      , reconnectInterval: 100
    });

    db.open(function(err, db) {
      // Now let's stop the server
      configuration.manager.stop().then(function() {

        db.collection('waiting_for_reconnect').insert({a:1}, function(err, r) {
          test.ok(err != null);
          db.close();

          configuration.manager.start().then(function() {
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly recover when bufferMaxEntries: -1 and multiple restarts'] = {
  metadata: { requires: { topology: ['single'] }, ignore: { travis:true } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , f = require('util').format;

    var done = false;

    MongoClient.connect('mongodb://localhost:27017/test', {db: {native_parser: true, bufferMaxEntries: -1},
      server: {
        poolSize: 20,
        socketOptions: {autoReconnect: true, keepAlive: 50},
        reconnectTries : 1000,
        reconnectInterval : 1000
      }}, function(err, db) {
        var col = db.collection('t');
        var count = 1;
        var allDone = 0;

        var execute = function() {
          if(!done) {
            col.insertOne({a:1, count: count}, function(err, r) {
              count = count + 1;

              col.findOne({}, function(err, doc) {
                setTimeout(execute, 500);
              });
            })
          } else {
            col.insertOne({a:1, count: count}, function(err, r) {
              test.equal(null, err);

              col.findOne({}, function(err, doc) {
                test.equal(null, err);
                db.close();
                test.done();
              });
            })
          }
        }

        setTimeout(execute, 500);
    });

    var count = 2

    var restartServer = function() {
      if(count == 0) {
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
    }

    setTimeout(restartServer, 1000);
  }
}

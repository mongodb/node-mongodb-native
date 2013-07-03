var format = require('util').format;

/**
 * @ignore
 */
exports['Should Correctly remove server going into recovery mode'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , Server = mongo.Server
    , Db = mongo.Db;

    var db = configuration.db();
    var keys_1 = Object.keys(db.serverConfig._state.secondaries);

    db.collection('test').insert({a:1}, function(err, result) {
      // Put a secondary into recovery mode
      db.admin().command({ replSetMaintenance: 1 }
        , {ignoreCommandFilter:true, readPreference:'secondary'}, function(err, result) {

        // Wait until the server goes away
        var interval = setInterval(function() {
          db.collection('test').findOne({}, {readPreference:'secondary'}, function(err, doc) {
            // var secondaries = db.serverConfig.secondaries;
            var keys_2 = Object.keys(db.serverConfig._state.secondaries);
            // If we have the secondary length correct
            if(keys_2.length == (keys_1.length - 1)) {
              // Clear the interval
              clearInterval(interval);
              // Server to connect to
              var server_url;
              // Connect to the server and 
              for(var i = 0; i < keys_1.length; i++) {
                if(keys_2.indexOf(keys_1[i]) == -1) {
                  server_url = keys_1[i];
                  break;
                }
              }

              // Let's connect to the single server
              new Db('test', new Server("localhost", server_url.split(":")[1]), {poolSize:1, slaveOk:1, w:1}).open(function(err, db1) {
                test.equal(null, err);

                db1.admin().command({ replSetMaintenance: 0 }, function(err, result) {
                  test.equal(null, err);

                  setTimeout(function() {
                    var keys_3 = Object.keys(db.serverConfig._state.secondaries);
                    test.deepEqual(keys_1, keys_3);
                    db1.close();
                    test.done();
                  }, 10000);
                });
              });
            }
          });
        }, 1000);
    });
  });
}
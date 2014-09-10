/**
 * @ignore
 */
exports['should correctly create a new user and authenticate using scram'] = {
  metadata: { requires: { topology: ['scram'], mongodb: ">=2.7.5" } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Buffer = require('buffer').Buffer
      , BSON = require('bson').pure().BSON
      , MongoClient = configuration.require.MongoClient;
      // console.dir(BSON)

    // User and password
    var user = 'test';
    var password = 'test';

    // var db = configuration.newDbInstance({w:1}, {poolSize:1});
    // db.open(function(err, db) {
    MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
      test.equal(null, err);

      db.admin().addUser(user, password, function(err, result) {
        test.equal(null, err);
        db.close();

        // Attempt to reconnect authenticating against the admin database
        MongoClient.connect('mongodb://test:test@localhost:27017/test?authMechanism=SCRAM-SHA-1&authSource=admin&maxPoolSize=1', function(err, db) {
          test.equal(null, err);
          console.dir(db)

          db.close();
          test.done();
        });
      });
    });
  }
}

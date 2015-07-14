"use strict";

exports['Correctly receive the APM events'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var listener = require('../..').instrument();
    listener.on('command', function(event) {
      console.log("===================================== received command")
      console.log(JSON.stringify(event, null, 2))
    });

    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      db.collection('apm_test').insertOne({a:1}).then(function(r) {
        test.equal(1, r.insertedCount);
        db.close();
        test.done();
      });
    });
  }
}

"use strict";

exports['Correctly receive the APM events for an insert'] = {
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

exports['Correctly receive the APM events for a find with getmore and killcursor'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var listener = require('../..').instrument();
    listener.on('started', function(event) {
      console.log("===================================== started :: " + event.commandName)
      // console.log(JSON.stringify(event, null, 2))
    });

    listener.on('succeeded', function(event) {
      console.log("===================================== succeeded :: " + event.commandName)
      // console.log(JSON.stringify(event, null, 2))
    });

    listener.on('failed', function(event) {
      console.log("===================================== failed :: " + event.commandName)
      // console.log(JSON.stringify(event, null, 2))
    });

    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      test.equal(null, err);

      // Drop the collection
      db.collection('apm_test_1').drop(function(err, r) {

        // Insert test documents
        db.collection('apm_test_1').insertMany([{a:1}, {a:1}, {a:1}, {a:1}, {a:1}, {a:1}]).then(function(r) {
          test.equal(6, r.insertedCount);

          db.collection('apm_test_1').find().batchSize(2).toArray().then(function(docs) {
            test.equal(6, docs.length);

            db.close();
            test.done();
          });
        }).catch(function(e) {
          console.dir(e)
        });
      });
    });
  }
}

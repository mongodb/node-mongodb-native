"use strict";

exports['Correctly receive the APM events for an insert'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var listener = require('../..').instrument();
    listener.on('started', function(event) {
      if(event.commandName == 'insert')
        started.push(event);
    });

    listener.on('succeeded', function(event) {
      if(event.commandName == 'insert')
        succeeded.push(event);
    });

    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      db.collection('apm_test').insertOne({a:1}).then(function(r) {
        test.equal(1, r.insertedCount);
        test.equal(1, started.length);
        test.equal(1, succeeded.length);

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
    var ReadPreference = configuration.require.ReadPreference;
    var started = [];
    var succeeded = [];
    var failed = [];

    var listener = require('../..').instrument();
    listener.on('started', function(event) {
      if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
        started.push(event);
    });

    listener.on('succeeded', function(event) {
      if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
        succeeded.push(event);
    });

    listener.on('failed', function(event) {
      if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
        failed.push(event);
    });

    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      test.equal(null, err);

      // Drop the collection
      db.collection('apm_test_1').drop(function(err, r) {

        // Insert test documents
        db.collection('apm_test_1').insertMany([{a:1}, {a:1}, {a:1}, {a:1}, {a:1}, {a:1}]).then(function(r) {
          test.equal(6, r.insertedCount);

          db.collection('apm_test_1').find({a:1})
            .sort({a:1})
            .project({_id: 1, a:1})
            .hint({'_id':1})
            .skip(1)
            .limit(100)
            .batchSize(2)
            .comment('some comment')
            .maxScan(1000)
            .maxTimeMS(5000)
            .setReadPreference(ReadPreference.PRIMARY)
            .addCursorFlag('noCursorTimeout', true)
            .toArray().then(function(docs) {
              // Assert basic documents
              test.equal(5, docs.length);
              test.equal(3, started.length);
              test.equal(3, succeeded.length);
              test.equal(0, failed.length);

              // Success messages
              test.equal(2, succeeded[0].reply.length);
              test.equal(succeeded[0].operationId, succeeded[1].operationId);
              test.equal(succeeded[0].operationId, succeeded[2].operationId);
              test.equal(2, succeeded[1].reply.length);
              test.equal(1, succeeded[2].reply.length);

              // Started
              test.equal(started[0].operationId, started[1].operationId);
              test.equal(started[0].operationId, started[2].operationId);

              db.close();
              test.done();
          }).catch(function(err) {
            console.dir(err)
          });
        }).catch(function(e) {
          console.dir(e)
        });
      });
    });
  }
}

exports['Correctly receive the APM failure event for find'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReadPreference = configuration.require.ReadPreference;
    var started = [];
    var succeeded = [];
    var failed = [];

    var listener = require('../..').instrument();
    listener.on('started', function(event) {
      if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
        started.push(event);
    });

    listener.on('succeeded', function(event) {
      if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
        succeeded.push(event);
    });

    listener.on('failed', function(event) {
      if(event.commandName == 'find' || event.commandName == 'getMore' || event.commandName == 'killCursors')
        failed.push(event);
    });

    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      test.equal(null, err);

      // Drop the collection
      db.collection('apm_test_2').drop(function(err, r) {

        // Insert test documents
        db.collection('apm_test_2').insertMany([{a:1}, {a:1}, {a:1}, {a:1}, {a:1}, {a:1}]).then(function(r) {
          test.equal(6, r.insertedCount);

          db.collection('apm_test_2').find({$illegalfield:1})
            .project({_id: 1, a:1})
            .hint({'_id':1})
            .skip(1)
            .limit(100)
            .batchSize(2)
            .comment('some comment')
            .maxScan(1000)
            .maxTimeMS(5000)
            .setReadPreference(ReadPreference.PRIMARY)
            .addCursorFlag('noCursorTimeout', true)
            .toArray().then(function(docs) {
          }).catch(function(err) {
            test.equal(1, failed.length);

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

exports['Correctly receive the APM events for a bulk operation'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var started = [];
    var succeeded = [];
    var failed = [];

    var listener = require('../..').instrument();
    listener.on('started', function(event) {
      // console.log(JSON.stringify(event, null, 2))
      if(event.commandName == 'insert' || event.commandName == 'update' || event.commandName == 'delete')
        started.push(event);
    });

    listener.on('succeeded', function(event) {
      if(event.commandName == 'insert' || event.commandName == 'update' || event.commandName == 'delete')
        succeeded.push(event);
    });

    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      db.collection('apm_test_3').bulkWrite([
            { insertOne: { a: 1 } }
          , { updateOne: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
          , { deleteOne: { q: {c:1} } }
        ], {ordered:true}).then(function(r) {
        test.equal(3, started.length);
        test.equal(3, succeeded.length);
        test.equal(started[0].operationId, started[1].operationId);
        test.equal(started[0].operationId, started[2].operationId);
        test.equal(succeeded[0].operationId, succeeded[1].operationId);
        test.equal(succeeded[0].operationId, succeeded[2].operationId);

        db.close();
        test.done();
      }).catch(function(err) {
        console.dir(err)
      });
    });
  }
}

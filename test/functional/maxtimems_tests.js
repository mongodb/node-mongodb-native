"use strict";

exports['Should Correctly respect the maxtimeMs property on count'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { disabled:true, requires: { mongodb: ">2.5.5", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:1}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        // Execute a find command
        col.find({"$where": "sleep(100) || true"})
          .maxTimeMS(50)
          .count(function(err, count) {
            test.ok(err != null);
            db.close();
            test.done();
        });
      });
    });
  }
}

exports['Should Correctly respect the maxtimeMs property on toArray'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    disabled:true,
    
    requires: {
      topology: ['single', 'replicaset'],
      mongodb: ">2.5.5"
    }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms_2');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:1}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        // Execute a find command
        col.find({"$where": "sleep(100) || true"})
          .maxTimeMS(50)
          .toArray(function(err, items) {
            test.ok(err != null);
            db.close();
            test.done();
        });
      });
    });
  }
}

exports['Should Correctly fail with maxTimeMS error'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
      topology: ['single', 'replicaset'],
      mongodb: ">2.5.5"
    }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var col = db.collection('max_time_ms_5');

      // Insert a couple of docs
      var docs_1 = [{agg_pipe:10}];

      // Simple insert
      col.insert(docs_1, {w:1}, function(err, result) {
        test.equal(null, err);

        db.admin().command({configureFailPoint: "maxTimeAlwaysTimeOut", mode: "alwaysOn"}, function(err, result) {
          test.equal(true, result.documents[0].ok);

          col.find({}).maxTimeMS(10).toArray(function(err, docs) {
            test.ok(err != null);

            db.admin().command({configureFailPoint: "maxTimeAlwaysTimeOut", mode: "off"}, function(err, result) {
              test.equal(true, result.documents[0].ok);
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

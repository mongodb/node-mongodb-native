"use strict";

var f = require('util').format;

exports['Should correctly execute Collection.prototype.insertOne'] = {
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

    MongoClient.connect(url).then(function(client) {
      test.equal(1, client.topology.connections().length);
      var db = client.db(configuration.database);

      db.collection('insertOne').insertOne({a:1}).then(function(r) {
        test.equal(1, r.insertedCount);

        client.close();
        test.done();
      });
    });
  }
}

exports['Should correctly execute findOneAndDelete operation With Promises and no options passed in'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.connect().then(function(client) {
      var db = client.db(configuration.database);
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
    // LINE   var db = client.db('test);
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_delete_with_promise_no_option');
      col.insertMany([{a:1, b:1}], {w:1}).then(function(r) {
        test.equal(1, r.result.n);

        col.findOneAndDelete({a:1}).then(function(r) {
          test.equal(1, r.lastErrorObject.n);
          test.equal(1, r.value.b);

          client.close();
          test.done();
        }).catch(function(err) {
          console.log(err.stack)
        });
      });
    });
    // END
  }
}

exports['Should correctly execute findOneAndUpate operation With Promises and no options passed in'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.connect().then(function(client) {
      var db = client.db(configuration.database);
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
    // LINE   var db = client.db('test);
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_update_with_promise_no_option');
      col.insertMany([{a:1, b:1}], {w:1}).then(function(r) {
        test.equal(1, r.result.n);

        col.findOneAndUpdate({a:1}, {$set:{a:1}}).then(function(r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);

            client.close();
            test.done();
        }).catch(function(err) {
          console.log(err.stack)
        });
      });
    });
    // END
  }
}

exports['Should correctly execute findOneAndReplace operation With Promises and no options passed in'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.connect().then(function(client) {
      var db = client.db(configuration.database);
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
    // LINE   var db = client.db('test);
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.done();
    // BEGIN
      // Get the collection
      var col = db.collection('find_one_and_replace_with_promise_no_option');
      col.insertMany([{a:1, b:1}], {w:1}).then(function(r) {
        test.equal(1, r.result.n);

        col.findOneAndReplace({a:1}, {a:1}).then(function(r) {
            test.equal(1, r.lastErrorObject.n);
            test.equal(1, r.value.b);

            client.close();
            test.done();
        }).catch(function(err) {
          console.log(err.stack)
        });
      });
    });
    // END
  }
}

exports['Should correctly handle bulkWrite with no options'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    var error = null;
    var result = null;

    client.connect().then(function(client) {
      var db = client.db(configuration.database);
      // Get the collection
      var col = db.collection('find_one_and_replace_with_promise_no_option');
      return col.bulkWrite([
        { insertOne: { document: { a: 1 } } }
      ])
    }).then(function(r) {
      result = r;
    }).catch(function(err) {
      error = err;
    }).then(function() {
      test.equal(null, error);
      test.ok(result != null);

      client.close();
      test.done();
    });
  }
}

exports['Should correctly return failing Promise when no document array passed into insertMany'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url).then(function(client) {
      var db = client.db(configuration.database);
      db.collection('insertMany_Promise_error').insertMany({a:1}).then(function(r) {
      }).catch(function(e) {
        test.ok(e != null);

        client.close();
        test.done();
      });
    });
  }
}

exports['Should correctly return failing Promise when array passed into insertOne'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url).then(function(client) {
      var db = client.db(configuration.database);
      db.collection('insertOne_Promise_error').insertOne([{a:1}]).then(function(r) {
      }).catch(function(e) {
        test.ok(e != null);

        client.close();
        test.done();
      });
    });
  }
}

exports['Should correctly execute unordered bulk operation in promise form'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url).then(function(client) {
      var db = client.db(configuration.database);
      var bulk = db.collection('unordered_bulk_promise_form').initializeUnorderedBulkOp({ w:1 });
      bulk.insert({a:1});
      bulk.execute().then(function(r) {
        test.ok(r);
        test.deepEqual({w:1}, bulk.s.writeConcern);

        client.close();
        test.done();
      });
    });
  }
}

exports['Should correctly execute ordered bulk operation in promise form'] = {
  metadata: { requires: { promises:true, topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var url = configuration.url();
    url = url.indexOf('?') != -1
      ? f('%s&%s', url, 'maxPoolSize=100')
      : f('%s?%s', url, 'maxPoolSize=100');

    MongoClient.connect(url).then(function(client) {
      var db = client.db(configuration.database);
      var bulk = db.collection('unordered_bulk_promise_form').initializeOrderedBulkOp({ w:1 });
      bulk.insert({a:1});
      bulk.execute().then(function(r) {
        test.ok(r);
        test.deepEqual({w:1}, bulk.s.writeConcern);

        client.close();
        test.done();
      });
    });
  }
}

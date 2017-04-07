"use strict";

var assert = require('assert');
var co = require('co');

/**
 * @ignore
 */
exports['test first three examples'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {

        var removePromise = db.collection('inventory').deleteMany({});

        var promise1 =
        // Start Example 1
        db.collection('inventory').insertOne({
          item: "canvas",
          qty: 100,
          tags: ["cotton"],
          size: { h: 28, w: 35.5, uom: "cm" }
        })
        // End Example 1
        .then(() => {
          return db.collection('inventory').count({});
        })

        assert.equal(1, yield promise1);

        // Start Example 2
        var cursor = db.collection('inventory').find({
          item: "canvas",
        });
        // End Example 2

        assert.equal(1, yield cursor.count());

        var promise3 =
        // Start Example 3
        db.collection('inventory').insertMany([
          { item: "journal",
            qty: 25,
            tags: ["blank", "red"],
            size: { h: 14, w: 21, uom: "cm" }},
          { item: "mat",
            qty: 85,
            tags: ["gray"],
            size: { h: 27.9, w: 35.5, uom: "cm" }},
          { item: "mousepad",
            qty: 25,
            tags: ["gel", "blue"],
            size: { h: 19, w: 22.85, uom: "cm" }}])
        // End Example 3
        .then(() => {
          return db.collection('inventory').count({});
        })

        assert.equal(4, yield promise3);

        db.close();
        test.done();
      });
    });    
  }
};

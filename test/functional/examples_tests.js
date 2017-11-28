"use strict";

var assert = require('assert');
var co = require('co');

/**
 * @ignore
 */
exports['first three examples'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {

        yield db.collection('inventory').deleteMany({});

        var promise1 =
        // Start Example 1
        db.collection('inventory').insertOne({
          item: "canvas",
          qty: 100,
          tags: ["cotton"],
          size: { h: 28, w: 35.5, uom: "cm" }
        })
        .then(function(result) {
          // process result
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
            size: { h: 19, w: 22.85, uom: "cm" }}
        ])
        .then(function(result) {
          // process result
        })
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

/**
 * @ignore
 */
exports['query top level fields'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 6
        db.collection('inventory').insertMany([
          { item: "journal",
            qty: 25,
            size: { h: 14, w: 21, uom: "cm" },
            status: "A"},
          { item: "notebook",
            qty: 50,
            size: { h: 8.5, w: 11, uom: "in" },
            status: "A"},
          { item: "paper",
            qty: 100,
            size: { h: 8.5, w: 11, uom: "in" },
            status: "D"},
          { item: "planner",
            qty: 75, size: { h: 22.85, w: 30, uom: "cm" },
            status: "D"},
          { item: "postcard",
            qty: 45,
            size: { h: 10, w: 15.25, uom: "cm" },
            status: "A"}
        ])
        .then(function(result) {
          // process result
        })
        // End Example 6
        yield promise;

        assert.equal(5, yield db.collection('inventory').count());

        // Start Example 7
        var cursor = db.collection('inventory').find({});
        // End Example 7
        assert.equal(5, yield cursor.count());

        // Start Example 9
        var cursor = db.collection('inventory').find({ status: "D" });
        // End Example 9
        assert.equal(2, yield cursor.count());

        // Start Example 10
        var cursor = db.collection('inventory').find({ 
          status: { $in: ["A", "D"] }
        });
        // End Example 10
        assert.equal(5, yield cursor.count());

        // Start Example 11
        var cursor = db.collection('inventory').find({ 
          status: "A", 
          qty: { $lt: 30 }
        });
        // End Example 11
        assert.equal(1, yield cursor.count());

        // Start Example 12
        var cursor = db.collection('inventory').find({ 
          $or: [ {status: "A" }, { qty: { $lt: 30 } } ]
        });
        // End Example 12
        assert.equal(3, yield cursor.count());

        // Start Example 13
        var cursor = db.collection('inventory').find({ 
          status: "A",
          $or: [ { qty: { $lt: 30 } }, { item: { $regex: "^p" } } ]
        });
        // End Example 13
        assert.equal(2, yield cursor.count());

        db.close();
        test.done();
      });
    });    
  }
};

/**
 * @ignore
 */
exports['query embedded documents'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 14
        db.collection('inventory').insertMany([
          { item: "journal",
            qty: 25,
            size: { h: 14, w: 21, uom: "cm" },
            status: "A"},
          { item: "notebook",
            qty: 50,
            size: { h: 8.5, w: 11, uom: "in" },
            status: "A"},
          { item: "paper",
            qty: 100,
            size: { h: 8.5, w: 11, uom: "in" },
            status: "D"},
          { item: "planner",
            qty: 75, size: { h: 22.85, w: 30, uom: "cm" },
            status: "D"},
          { item: "postcard",
            qty: 45,
            size: { h: 10, w: 15.25, uom: "cm" },
            status: "A"}
        ])
        .then(function(result) {
          // process result
        })
        // End Example 14
        yield promise;

        // Start Example 15
        var cursor = db.collection('inventory').find({ 
          size: { h: 14, w: 21, uom: "cm" }
        });
        // End Example 15
        assert.equal(1, yield cursor.count());

        // Start Example 16
        var cursor = db.collection('inventory').find({ 
          size: { w: 21, h: 14, uom: "cm" }
        });
        // End Example 16
        assert.equal(0, yield cursor.count());

        // Start Example 17
        var cursor = db.collection('inventory').find({ 
          "size.uom": "in"
        });
        // End Example 17
        assert.equal(2, yield cursor.count());

        // Start Example 18
        var cursor = db.collection('inventory').find({ 
          "size.h": { $lt: 15 }
        });
        // End Example 18
        assert.equal(4, yield cursor.count());

        // Start Example 19
        var cursor = db.collection('inventory').find({ 
          "size.h": { $lt: 15 }, 
          "size.uom": "in", 
          status: "D"
        });
        // End Example 19
        assert.equal(1, yield cursor.count());

        db.close();
        test.done();
      });
    });    
  }
};

/**
 * @ignore
 */
exports['query arrays'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 20
        db.collection('inventory').insertMany([
          { item: "journal",
            qty: 25,
            tags: ["blank", "red"],
            dim_cm: [14, 21]},
          { item: "notebook",
            qty: 50,
            tags: ["red", "blank"],
            dim_cm: [14, 21]},
          { item: "paper",
            qty: 100,
            tags: ["red", "blank", "plain"],
            dim_cm: [14, 21]},
          { item: "planner",
            qty: 75,
            tags: ["blank", "red"],
            dim_cm: [22.85, 30]},
          { item: "postcard",
            qty: 45,
            tags: ["blue"],
            dim_cm: [10, 15.25]}
        ])
        .then(function(result) {
          // process result
        })
        // End Example 20
        yield promise;

        // Start Example 21
        var cursor = db.collection('inventory').find({ 
          tags: [ "red", "blank" ]
        });
        // End Example 21
        assert.equal(1, yield cursor.count());

        // Start Example 22
        var cursor = db.collection('inventory').find({ 
          tags: { $all: [ "red", "blank" ]}
        });
        // End Example 22
        assert.equal(4, yield cursor.count());

        // Start Example 23
        var cursor = db.collection('inventory').find({ 
          tags: "red"
        });
        // End Example 23
        assert.equal(4, yield cursor.count());

        // Start Example 24
        var cursor = db.collection('inventory').find({ 
          dim_cm: { $gt: 25 }
        });
        // End Example 24
        assert.equal(1, yield cursor.count());

        // Start Example 25
        var cursor = db.collection('inventory').find({ 
          dim_cm: { $gt: 15, $lt: 20 }
        });
        // End Example 25
        assert.equal(4, yield cursor.count());

        // Start Example 26
        var cursor = db.collection('inventory').find({ 
          dim_cm: { $elemMatch: { $gt: 22, $lt: 30 } }
        });
        // End Example 26
        assert.equal(1, yield cursor.count());

        // Start Example 27
        var cursor = db.collection('inventory').find({ 
          "dim_cm.1": { $gt: 25 }
        });
        // End Example 27
        assert.equal(1, yield cursor.count());

        // Start Example 28
        var cursor = db.collection('inventory').find({ 
          tags: { $size: 3 }
        });
        // End Example 28
        assert.equal(1, yield cursor.count());

        db.close();
        test.done();
      });
    });    
  }
};

/**
 * @ignore
 */
exports['query array of documents'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 29
        db.collection('inventory').insertMany([
          { item: "journal",
            instock: [
              { warehouse: "A", qty: 5 },
              { warehouse: "C", qty: 15 }]},
          { item: "notebook",
            instock: [
              { warehouse: "C", qty: 5 }]},
          { item: "paper",
            instock: [
              { warehouse: "A", qty: 60 },
              { warehouse: "B", qty: 15 }]},
          { item: "planner",
            instock: [
              { warehouse: "A", qty: 40 },
              { warehouse: "B", qty: 5 }]},
          { item: "postcard",
            instock: [
              { warehouse: "B", qty: 15 },
              { warehouse: "C", qty: 35 }]}
        ])
        .then(function(result) {
          // process result
        })
        // End Example 29
        yield promise;

        // Start Example 30
        var cursor = db.collection('inventory').find({ 
          instock: { warehouse: "A", qty: 5 }
        });
        // End Example 30
        assert.equal(1, yield cursor.count());

        // Start Example 31
        var cursor = db.collection('inventory').find({ 
          instock: { qty: 5, warehouse: "A" }
        });
        // End Example 31
        assert.equal(0, yield cursor.count());

        // Start Example 32
        var cursor = db.collection('inventory').find({ 
          "instock.0.qty": { $lte: 20 }
        });
        // End Example 32
        assert.equal(3, yield cursor.count());

        // Start Example 33
        var cursor = db.collection('inventory').find({ 
          "instock.qty": { $lte: 20 }
        });
        // End Example 33
        assert.equal(5, yield cursor.count());

        // Start Example 34
        var cursor = db.collection('inventory').find({ 
          instock: { $elemMatch: { qty: 5, warehouse: "A" } }
        });
        // End Example 34
        assert.equal(1, yield cursor.count());

        // Start Example 35
        var cursor = db.collection('inventory').find({ 
          instock: { $elemMatch: { qty: { $gt: 10, $lte: 20 } } }
        });
        // End Example 35
        assert.equal(3, yield cursor.count());

        // Start Example 36
        var cursor = db.collection('inventory').find({ 
          "instock.qty": { $gt: 10, $lte: 20 }
        });
        // End Example 36
        assert.equal(4, yield cursor.count());

        // Start Example 37
        var cursor = db.collection('inventory').find({ 
          "instock.qty": 5, "instock.warehouse": "A"
        });
        // End Example 37
        assert.equal(2, yield cursor.count());

        db.close();
        test.done();
      });
    });    
  }
};

/**
 * @ignore
 */
exports['query null'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 38
        db.collection('inventory').insertMany([
          { _id: 1, item: null }, 
          { _id: 2 }
        ])
        .then(function(result) {
          // process result
        })
        // End Example 38
        yield promise;

        // Start Example 39
        var cursor = db.collection('inventory').find({ 
          item: null
        });
        // End Example 39
        assert.equal(2, yield cursor.count());

        // Start Example 40
        var cursor = db.collection('inventory').find({ 
          item: { $type: 10 }
        });
        // End Example 40
        assert.equal(1, yield cursor.count());

        // Start Example 41
        var cursor = db.collection('inventory').find({ 
          item: { $exists: false }
        });
        // End Example 41
        assert.equal(1, yield cursor.count());

        db.close();
        test.done();
      });
    });    
  }
};

/**
 * @ignore
 */
exports['projection'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 42
        db.collection('inventory').insertMany([
          { item: "journal",
            status: "A",
            size: { h: 14, w: 21, uom: "cm" },
            instock: [ { warehouse: "A", qty: 5 } ]},
          { item: "notebook",
            status: "A",
            size: { h: 8.5, w: 11, uom: "in" },
            instock: [ { warehouse: "C", qty: 5 } ]},
          { item: "paper",
            status: "D",
            size: { h: 8.5, w: 11, uom: "in" },
            instock: [ { warehouse: "A", qty: 60 } ]},
          { item: "planner",
            status: "D",
            size: { h: 22.85, w: 30, uom: "cm"},
            instock: [ { warehouse: "A", qty: 40 } ]},
          { item: "postcard",
            status: "A",
            size: { h: 10, w: 15.25, uom: "cm" },
            instock: [
                { warehouse: "B", qty: 15 },
                { warehouse: "C", qty: 35 }]}
        ])
        .then(function(result) {
          // process result
        })
        // End Example 42
        yield promise;

        // Start Example 43
        var cursor = db.collection('inventory').find({ 
          status: "A"
        });
        // End Example 43
        assert.equal(3, yield cursor.count());

        // Start Example 44
        var cursor = db.collection('inventory').find({ 
          status: "A"
        }).project({ item: 1, status: 1 });
        // End Example 44
        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.ok(doc._id);
          assert.ok(doc.item);
          assert.ok(doc.status);
          assert.equal(undefined, doc.size);
          assert.equal(undefined, doc.instock);
        });

        // Start Example 45
        var cursor = db.collection('inventory').find({ 
          status: "A"
        }).project({ item: 1, status: 1, _id: 0 });
        // End Example 45
        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.equal(undefined, doc._id);
          assert.ok(doc.item);
          assert.ok(doc.status);
          assert.equal(undefined, doc.size);
          assert.equal(undefined, doc.instock);
        });

        // Start Example 46
        var cursor = db.collection('inventory').find({ 
          status: "A"
        }).project({ status: 0, instock: 0 });
        // End Example 46
        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.ok(doc._id);
          assert.ok(doc.item);
          assert.equal(undefined, doc.status);
          assert.ok(doc.size);
          assert.equal(undefined, doc.instock);
        });

        // Start Example 47
        var cursor = db.collection('inventory').find({ 
          status: "A"
        }).project({ item: 1, status: 1, "size.uom": 1 });
        // End Example 47
        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.ok(doc._id);
          assert.ok(doc.item);
          assert.ok(doc.status);
          assert.ok(doc.size);
          assert.equal(undefined, doc.instock);
          var size = doc.size;
          assert.ok(size.uom);
          assert.equal(undefined, size.h);
          assert.equal(undefined, size.w);
        });

        // Start Example 48
        var cursor = db.collection('inventory').find({ 
          status: "A"
        }).project({ "size.uom": 0 });
        // End Example 48
        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.ok(doc._id);
          assert.ok(doc.item);
          assert.ok(doc.status);
          assert.ok(doc.size);
          assert.ok(doc.instock);
          var size = doc.size;
          assert.equal(undefined, size.uom);
          assert.ok(size.h);
          assert.ok(size.w);
        });

        // Start Example 49
        var cursor = db.collection('inventory').find({ 
          status: "A"
        }).project({ item: 1, status: 1, "instock.qty": 1 });
        // End Example 49
        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.ok(doc._id);
          assert.ok(doc.item);
          assert.ok(doc.status);
          assert.equal(undefined, doc.size);
          doc.instock.forEach(function(subdoc) {
            assert.equal(undefined, subdoc.warehouse);
            assert.ok(subdoc.qty);
          });
        });

        // Start Example 50
        var cursor = db.collection('inventory').find({ 
          status: "A"
        }).project({ item: 1, status: 1, "instock": { $slice: -1 } });
        // End Example 50
        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.ok(doc._id);
          assert.ok(doc.item);
          assert.ok(doc.status);
          assert.equal(undefined, doc.size);
          assert.ok(doc.instock);
          assert.equal(1, doc.instock.length);
        });

        db.close();
        test.done();
      });
    });    
  }
};

/**
 * @ignore
 */
exports['update and replace'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 51
        db.collection('inventory').insertMany([
          { item: "canvas",
            qty: 100,
            size: {h: 28, w: 35.5, uom: "cm"},
            status: "A"},
          { item: "journal",
            qty: 25,
            size: {h: 14, w: 21, uom: "cm"},
            status: "A"},
          { item: "mat",
            qty: 85,
            size: {h: 27.9, w: 35.5, uom: "cm"},
            status: "A"},
          { item: "mousepad",
            qty: 25,
            size: {h: 19, w: 22.85, uom: "cm"},
            status: "P"},
          { item: "notebook",
            qty: 50,
            size: {h: 8.5, w: 11, uom: "in"},
            status: "P"},
          { item: "paper",
            qty: 100,
            size: {h: 8.5, w: 11, uom: "in"},
            status: "D"},
          { item: "planner",
            qty: 75,
            size: {h: 22.85, w: 30, uom: "cm"},
            status: "D"},
          { item: "postcard",
            qty: 45,
            size: {h: 10, w: 15.25, uom: "cm"},
            status: "A"},
          { item: "sketchbook",
            qty: 80,
            size: {h: 14, w: 21, uom: "cm"},
            status: "A"},
          { item: "sketch pad",
            qty: 95,
            size: {h: 22.85, w: 30.5, uom: "cm"},
            status: "A"}
        ])
        .then(function(result) {
          // process result
        })
        // End Example 51
        yield promise;

        var promise =
        // Start Example 52
        db.collection('inventory').updateOne(
          { item: "paper" },
          { $set: { "size.uom": "cm", status: "P" },
            $currentDate: { lastModified: true } })
        .then(function(result) {
          // process result
        })            
        // End Example 52
        yield promise;
        var cursor = db.collection('inventory').find({ 
          item: "paper"
        });

        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.equal("cm", doc.size.uom);
          assert.equal("P", doc.status);
          assert.ok(doc.lastModified);
        });

        var promise =
        // Start Example 53
        db.collection('inventory').updateMany(
          { qty: { $lt: 50 } },
          { $set: { "size.uom": "in", status: "P" },
            $currentDate: { lastModified: true } })
        .then(function(result) {
          // process result
        })            
        // End Example 53
        yield promise;
        var cursor = db.collection('inventory').find({ 
          qty: { $lt: 50 }
        });

        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.equal("in", doc.size.uom);
          assert.equal("P", doc.status);
          assert.ok(doc.lastModified);
        });

        var promise =
        // Start Example 54
        db.collection('inventory').replaceOne(
          { item: "paper" },
          { item: "paper", 
            instock: [
              { warehouse: "A", qty: 60 },
              { warehouse: "B", qty: 40 }
            ]})
        .then(function(result) {
          // process result
        })
        // End Example 54
        yield promise;
        var cursor = db.collection('inventory').find({ 
          item: "paper"
        }).project({ _id: 0 });

        var docs = yield cursor.toArray();
        docs.forEach(function(doc) {
          assert.equal(2, Object.keys(doc).length);
          assert.ok(doc.item);
          assert.ok(doc.instock);
          assert.equal(2, doc.instock.length);
        });

        db.close();
        test.done();
      });
    });    
  }
};

/**
 * @ignore
 */
exports['delete'] = {
  metadata: { requires: { 
    topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
    mongodb: ">= 2.8.0"
  } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;

    // Connect and validate the server certificate
    MongoClient.connect(configuration.url(), function(err, db) {
      test.equal(null, err);

      co(function*() {
        yield db.collection('inventory').deleteMany({});

        var promise =
        // Start Example 55
        db.collection('inventory').insertMany([
          { item: "journal",
            qty: 25,
            size: { h: 14, w: 21, uom: "cm" },
            status: "A"},
          { item: "notebook",
            qty: 50,
            size: { h: 8.5, w: 11, uom: "in" },
            status: "P"},
          { item: "paper",
            qty: 100,
            size: { h: 8.5, w: 11, uom: "in" },
            status: "D"},
          { item: "planner",
            qty: 75,
            size: { h: 22.85, w: 30, uom: "cm" },
            status: "D"},
          { item: "postcard",
            qty: 45,
            size: { h: 10, w: 15.25, uom: "cm" },
            status: "A"}
        ])
        .then(function(result) {
          // process result
        })
        // End Example 55
        yield promise;

        var cursor = db.collection('inventory').find({});
        assert.equal(5, yield cursor.count());

        var promise =
        // Start Example 57
        db.collection('inventory').deleteMany({ 
          status: "A" 
        })
        .then(function(result) {
          // process result
        })
        // End Example 57
        yield promise;
        var cursor = db.collection('inventory').find({});
        assert.equal(3, yield cursor.count());
        
        var promise =
        // Start Example 58
        db.collection('inventory').deleteOne({ 
          status: "D" 
        })
        .then(function(result) {
          // process result
        })
        // End Example 58
        yield promise;
        var cursor = db.collection('inventory').find({});
        assert.equal(2, yield cursor.count());

        var promise =
        // Start Example 56
        db.collection('inventory').deleteMany({})
        .then(function(result) {
          // process result
        })
        // End Example 56
        yield promise;
        var cursor = db.collection('inventory').find({});
        assert.equal(0, yield cursor.count());

        db.close();
        test.done();
      });
    });    
  }
};

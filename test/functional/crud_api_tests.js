"use strict";

var fs = require('fs');

// instanceof cannot be use reliably to detect the new models in js due to scoping and new contexts killing class info
// find/distinct/count thus cannot be overloaded without breaking backwards compatibility in a fundamental way
//
//

/**
 * @ignore
 */
exports['should correctly execute find method using crud api'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {

      db.collection('t').insert([{a:1}, {a:1}, {a:1}, {a:1}], function(err) {
        test.equal(null, err);

        //
        // Cursor
        // --------------------------------------------------
        var cursor = db.collection('t').find({});
        // Possible methods on the the cursor instance
        cursor.filter({a:1})
          .addCursorFlag('noCursorTimeout', true)
          .addQueryModifier('$comment', 'some comment')
          .batchSize(2)
          .comment('some comment 2')
          .limit(2)
          .maxTimeMs(50)
          .project({a:1})
          .skip(0)
          .sort({a:1});

        //
        // Exercise count method
        // -------------------------------------------------
        var countMethod = function() {
          // Execute the different methods supported by the cursor
          cursor.count(function(err, count) {
            test.equal(null, err);
            test.equal(2, count);
            eachMethod();
          });
        }

        //
        // Exercise legacy method each
        // -------------------------------------------------
        var eachMethod = function() {
          var count = 0;

          cursor.each(function(err, doc) {
            test.equal(null, err);
            if(doc) count = count + 1;
            if(doc == null) {
              test.equal(2, count);
              toArrayMethod();
            }
          });
        }

        //
        // Exercise toArray
        // -------------------------------------------------
        var toArrayMethod = function() {
          cursor.toArray(function(err, docs) {
            test.equal(null, err);
            test.equal(2, docs.length);
            nextMethod();
          });
        }

        //
        // Exercise next method
        // -------------------------------------------------
        var nextMethod = function() {
          var clonedCursor = cursor.clone();
          clonedCursor.next(function(err, doc) {
            test.equal(null, err);
            test.ok(doc != null);

            clonedCursor.next(function(err, doc) {
              test.equal(null, err);
              test.ok(doc != null);

              clonedCursor.next(function(err, doc) {
                test.equal(null, err);
                test.equal(null, doc);
                nextObjectMethod();
              });
            });
          });
        }

        //
        // Exercise nextObject legacy method
        // -------------------------------------------------
        var nextObjectMethod = function() {
          var clonedCursor = cursor.clone();
          clonedCursor.nextObject(function(err, doc) {
            test.equal(null, err);
            test.ok(doc != null);

            clonedCursor.nextObject(function(err, doc) {
              test.equal(null, err);
              test.ok(doc != null);

              clonedCursor.nextObject(function(err, doc) {
                test.equal(null, err);
                test.equal(null, doc);
                streamMethod();
              });
            });
          });
        }

        //
        // Exercise stream
        // -------------------------------------------------
        var streamMethod = function(callback) {
          var count = 0;
          var clonedCursor = cursor.clone();
          clonedCursor.on('data', function() {
            count = count + 1;
          });

          clonedCursor.once('end', function() {
            test.equal(2, count);
            explainMethod();
          });
        }

        //
        // Explain method
        // -------------------------------------------------
        var explainMethod = function(callback) {
          var clonedCursor = cursor.clone();
          clonedCursor.explain(function(err, result) {
            test.equal(null, err);
            test.ok(result != null);

            db.close();
            test.done();
          });
        }

        // Execute all the methods
        countMethod();
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly execute aggregation method using crud api'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {

      db.collection('t1').insert([{a:1}, {a:1}, {a:2}, {a:1}], function(err) {
        test.equal(null, err);

        var testAllMethods = function() {
          // Get the cursor
          var cursor = db.collection('t1').aggregate({
              pipeline: [{$match: {}}]
            , allowDiskUse: true
            , batchSize: 2
            , maxTimeMS: 50
          });

          // Exercise all the options
          cursor.geoNear({geo:1})
            .group({group:1})
            .limit(10)
            .match({match:1})
            .maxTimeMS(10)
            .out("collection")
            .project({project:1})
            .redact({redact:1})
            .skip(1)
            .sort({sort:1})
            .batchSize(10)
            .unwind("name");

          // Execute the command with all steps defined
          // will fail
          cursor.toArray(function(err, results) {
            test.ok(err != null);
            testToArray();
          });
        }

        //
        // Exercise toArray
        // -------------------------------------------------
        var testToArray = function() {
          var cursor = db.collection('t1').aggregate();
          cursor.match({a:1});
          cursor.toArray(function(err, docs) {
            test.equal(null, err);
            test.equal(3, docs.length);
            testNext();
          });
        }

        //
        // Exercise next
        // -------------------------------------------------
        var testNext = function() {
          var cursor = db.collection('t1').aggregate();
          cursor.match({a:1});
          cursor.next(function(err, doc) {
            test.equal(null, err);
            testEach();
          });
        }

        //
        // Exercise each
        // -------------------------------------------------
        var testEach = function() {
          var count = 0;
          var cursor = db.collection('t1').aggregate();
          cursor.match({a:1});
          cursor.each(function(err, doc) {
            test.equal(null, err);
            if(doc) count = count + 1;
            if(doc == null) {
              test.equal(3, count);
              testStream();
            }
          });
        }

        //
        // Exercise stream
        // -------------------------------------------------
        var testStream = function() {
          var cursor = db.collection('t1').aggregate();
          var count = 0;
          cursor.match({a:1});
          cursor.on('data', function() {
            count = count + 1;
          });

          cursor.once('end', function() {
            test.equal(3, count);
            testExplain();
          });
        }

        //
        // Explain method
        // -------------------------------------------------
        var testExplain = function() {
          var cursor = db.collection('t1').aggregate();
          cursor.explain(function(err, result) {
            test.equal(null, err);
            test.ok(result != null);

            db.close();
            test.done();
          });
        }

        testAllMethods();
      });
    });
  }
}

exports['should correctly execute insert methods using crud api'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {

      //
      // Legacy insert method
      // -------------------------------------------------
      var legacyInsert = function() {
        db.collection('t2_1').insert([{a:1}, {a:2}], function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          bulkAPIInsert();
        });
      }

      //
      // Bulk api insert method
      // -------------------------------------------------
      var bulkAPIInsert = function() {
        var bulk = db.collection('t2_2').initializeOrderedBulkOp();
        bulk.insert({a:1});
        bulk.insert({a:1});
        bulk.execute(function(err, r) {
          test.equal(null, err);

          insertOne();
        });
      }

      //
      // Insert one method
      // -------------------------------------------------
      var insertOne = function() {
        db.collection('t2_3').insertOne({a:1}, {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);
          test.equal(1, r.insertedCount);
          test.ok(r.insertedId != null);

          insertMany();
        });
      }

      //
      // Insert many method
      // -------------------------------------------------
      var insertMany = function() {
        var docs = [{a:1}, {a:1}];
        db.collection('t2_4').insertMany(docs, {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);
          test.equal(2, r.insertedCount);
          test.equal(2, r.insertedIds.length);

          // Ordered bulk unordered
          bulkWriteUnOrdered();
        });
      }

      //
      // Bulk write method unordered
      // -------------------------------------------------
      var bulkWriteUnOrdered = function() {
        db.collection('t2_5').insertMany([{c:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          db.collection('t2_5').bulkWrite([
              { insertOne: { a: 1 } }
            , { insertMany: [{ g: 1 }, { g: 2 }] }
            , { updateOne: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
            , { updateMany: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
            , { deleteOne: { q: {c:1} } }
            , { deleteMany: { q: {c:1} } }]
          , {ordered:false, w:1}, function(err, r) {
            test.equal(null, err);
            test.equal(3, r.nInserted);
            test.equal(1, r.nUpserted);
            test.equal(1, r.nRemoved);

            // Crud fields
            test.equal(3, r.insertedCount);
            test.equal(3, Object.keys(r.insertedIds).length);
            test.equal(1, r.matchedCount);
            test.equal(1, r.deletedCount);
            test.equal(1, r.upsertedCount);
            test.equal(1, Object.keys(r.upsertedIds).length);

            // Ordered bulk operation
            bulkWriteUnOrderedSpec();
          });
        });
      }

      //
      // Bulk write method unordered
      // -------------------------------------------------
      var bulkWriteUnOrderedSpec = function() {
        db.collection('t2_6').insertMany([{c:1}, {c:2}, {c:3}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(3, r.result.n);

          db.collection('t2_6').bulkWrite([
              { insertOne: { document: { a: 1 } } }
            , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
            , { updateMany: { filter: {a:3}, update: {$set: {a:3}}, upsert:true } }
            , { deleteOne: { filter: {c:1} } }
            , { deleteMany: { filter: {c:2} } }
            , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true } }]
          , {ordered:false, w:1}, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.nInserted);
            test.equal(2, r.nUpserted);
            test.equal(2, r.nRemoved);

            // Crud fields
            test.equal(1, r.insertedCount);
            test.equal(1, Object.keys(r.insertedIds).length);
            test.equal(1, r.matchedCount);
            test.equal(2, r.deletedCount);
            test.equal(2, r.upsertedCount);
            test.equal(2, Object.keys(r.upsertedIds).length);

            // Ordered bulk operation
            bulkWriteOrdered();
          });
        });
      }

      //
      // Bulk write method ordered
      // -------------------------------------------------
      var bulkWriteOrdered = function() {
        db.collection('t2_7').insertMany([{c:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          db.collection('t2_7').bulkWrite([
              { insertOne: { a: 1 } }
            , { insertMany: [{ g: 1 }, { g: 2 }] }
            , { updateOne: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
            , { updateMany: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
            , { deleteOne: { q: {c:1} } }
            , { deleteMany: { q: {c:1} } }]
          , {ordered:true, w:1}, function(err, r) {
            test.equal(null, err);
            test.equal(3, r.nInserted);
            test.equal(1, r.nUpserted);
            test.equal(1, r.nRemoved);

            // Crud fields
            test.equal(3, r.insertedCount);
            test.equal(3, Object.keys(r.insertedIds).length);
            test.equal(1, r.matchedCount);
            test.equal(1, r.deletedCount);
            test.equal(1, r.upsertedCount);
            test.equal(1, Object.keys(r.upsertedIds).length);

            bulkWriteOrderedCrudSpec();
          });
        });
      }

      //
      // Bulk write method ordered
      // -------------------------------------------------
      var bulkWriteOrderedCrudSpec = function() {
        db.collection('t2_8').insertMany([{c:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          db.collection('t2_8').bulkWrite([
              { insertOne: { document: { a: 1 }} }
            , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
            , { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
            , { deleteOne: { filter: {c:1} } }
            , { deleteMany: { filter: {c:1} } }
            , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true } }]
          , {ordered:true, w:1}, function(err, r) {
            // test.equal(null, err);
            test.equal(1, r.nInserted);
            test.equal(2, r.nUpserted);
            test.equal(1, r.nRemoved);

            // Crud fields
            test.equal(1, r.insertedCount);
            test.equal(1, Object.keys(r.insertedIds).length);
            test.equal(1, r.matchedCount);
            test.equal(1, r.deletedCount);
            test.equal(2, r.upsertedCount);
            test.equal(2, Object.keys(r.upsertedIds).length);

            db.close();
            test.done();
          });
        });
      }

      legacyInsert();
    });
  }
}

exports['should correctly execute update methods using crud api'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {

      //
      // Legacy update method
      // -------------------------------------------------
      var legacyUpdate = function() {
        db.collection('t3_1').update({a:1}, {$set: {a:2}}, {upsert:true}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          updateOne();
        });
      }

      //
      // Update one method
      // -------------------------------------------------
      var updateOne = function() {
        db.collection('t3_2').insertMany([{c:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          db.collection('t3_2').updateOne({ a: 1 }
            , { $set: { a: 1 } }
            , { upsert: true }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.n);
            test.equal(1, r.matchedCount);
            test.ok(r.upsertedId != null);

            db.collection('t3_2').updateOne({ c: 1 }
              , { $set: { a: 1 } }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.n);
              test.equal(1, r.matchedCount);
              test.ok(r.upsertedId == null);

              replaceOne();
            });
          });
        });
      }

      //
      // Replace one method
      // -------------------------------------------------
      var replaceOne = function() {
        db.collection('t3_3').replaceOne({ a: 1 }
          , { a : 2 }
          , { upsert: true }, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);
          test.equal(1, r.matchedCount);
          test.equal(1, r.ops.length);
          test.ok(r.upsertedId != null);

          db.collection('t3_3').replaceOne({ a: 2 }
            , { a : 3 }
            , { upsert: true }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.n);
            test.ok(r.result.upserted == null);
            test.equal(1, r.ops.length);

            test.equal(1, r.matchedCount);
            test.ok(r.upsertedId == null);

            updateMany();
          });
        });
      }

      //
      // Update many method
      // -------------------------------------------------
      var updateMany = function() {
        db.collection('t3_4').insertMany([{a:1}, {a:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          db.collection('t3_4').updateMany({ a: 1 }
            , { $set: { a: 2 } }
            , { upsert: true, w: 1 }, function(err, r) {
            test.equal(null, err);
            test.equal(2, r.result.n);
            test.equal(2, r.matchedCount);
            test.ok(r.upsertedId == null);

            db.collection('t3_4').updateMany({ c: 1 }
              , { $set: { d: 2 } }
              , { upsert: true, w: 1 }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.matchedCount);
              test.ok(r.upsertedId != null);

              db.close();
              test.done();
            });
          });
        });
      }

      legacyUpdate();
    });
  }
}

exports['should correctly execute remove methods using crud api'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {

      //
      // Legacy update method
      // -------------------------------------------------
      var legacyRemove = function() {
        db.collection('t4_1').insertMany([{a:1}, {a:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          db.collection('t4_1').remove({a:1}, {single:true}, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.n);

            deleteOne();
          });
        });
      }

      //
      // Update one method
      // -------------------------------------------------
      var deleteOne = function() {
        db.collection('t4_2').insertMany([{a:1}, {a:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          db.collection('t4_2').deleteOne({ a: 1 }
            , function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.n);
              test.equal(1, r.deletedCount);

              deleteMany();
          });
        });
      }

      //
      // Update many method
      // -------------------------------------------------
      var deleteMany = function() {
        db.collection('t4_3').insertMany([{a:1}, {a:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          db.collection('t4_3').deleteMany({ a: 1 }
            , function(err, r) {
              test.equal(null, err);
              test.equal(2, r.result.n);
              test.equal(2, r.deletedCount);

              db.close();
              test.done();
          });
        });
      }

      legacyRemove();
    });
  }
}

exports['should correctly execute findAndModify methods using crud api'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {

      //
      // findOneAndRemove method
      // -------------------------------------------------
      var findOneAndRemove = function() {
        db.collection('t5_1').insertMany([{a:1, b:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          db.collection('t5_1').findOneAndDelete({a:1}
            , { projection: {b:1}, sort: {a:1} }
            , function(err, r) {
              test.equal(null, err);
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);

              findOneAndReplace();
          });
        });
      }

      //
      // findOneAndRemove method
      // -------------------------------------------------
      var findOneAndReplace = function() {
        db.collection('t5_2').insertMany([{a:1, b:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          db.collection('t5_2').findOneAndReplace({a:1}
            , {c:1, b:1}
            , {
                  projection: {b:1, c:1}
                , sort: {a:1}
                , returnOriginal: false
                , upsert: true
              }
            , function(err, r) {
              test.equal(null, err);
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.c);

              findOneAndUpdate();
          });
        });
      }

      //
      // findOneAndRemove method
      // -------------------------------------------------
      var findOneAndUpdate = function() {
        db.collection('t5_3').insertMany([{a:1, b:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          db.collection('t5_3').findOneAndUpdate({a:1}
            , {$set: {d:1}}
            , {
                  projection: {b:1, d:1}
                , sort: {a:1}
                , returnOriginal: false
                , upsert: true
              }
            , function(err, r) {
              test.equal(null, err);
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);
              test.equal(1, r.value.d);

              db.close();
              test.done();
          });
        });
      }

      findOneAndRemove();
    });
  }
}

exports['should correctly execute removeMany with no selector'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {
      test.equal(null, err);

      // Delete all items with no selector
      db.collection('t6_1').deleteMany(function(err, r) {
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  }
}

exports['should correctly execute crud operations with w:0'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {
      test.equal(null, err);

      var col = db.collection('shouldCorrectlyExecuteInsertOneWithW0');
      col.insertOne({a:1}, {w:0}, function(err,result) {
        test.equal(null, err);
        test.equal(1, result.result.ok);

        col.insertMany([{a:1}], {w:0}, function(err, result) {
          test.equal(null, err);
          test.equal(1, result.result.ok);

          col.updateOne({a:1}, {$set: {b:1}}, {w:0}, function(err, result) {
            test.equal(null, err);
            test.equal(1, result.result.ok);

            col.updateMany({a:1}, {$set: {b:1}}, {w:0}, function(err, result) {
              test.equal(null, err);
              test.equal(1, result.result.ok);

              col.deleteOne({a:1}, {w:0}, function(err, result) {
                test.equal(null, err);
                test.equal(1, result.result.ok);

                col.deleteMany({a:1}, {w:0}, function(err, result) {
                  test.equal(null, err);
                  test.equal(1, result.result.ok);

                  db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
  }
}

exports['should correctly execute updateOne operations with w:0 and upsert'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {
      test.equal(null, err);

      db.collection('try').updateOne({_id:1}, {$set:{x:1}}, {upsert:true, w:0}, function(err, r) {
        test.equal(null, err);
        test.ok(r != null);

        db.close();
        test.done();
      });
    });
  }
}

exports['should correctly execute crud operations using w:0'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {
      test.equal(null, err);

      var collection = db.collection('w0crudoperations');
      collection.insertOne({}, function(err, r) {
        console.log("-------------------------------------------")
        console.dir(err)
        console.dir(r)

        db.close();
        test.done();
      });

      // collection.insertOne({a:1});
      // collection.insertMany([{b:1}]);
      // collection.updateOne({c:1}, {$set:{a:1}}, {upsert:true});


      // db.collection('try').updateOne({_id:1}, {$set:{x:1}}, {upsert:true, w:0}, function(err, r) {
      //   test.equal(null, err);
      //   test.ok(r != null);

      //   db.close();
      //   test.done();
      // });
    });
  }
}

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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
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
          
          bulkWrite();
        });
      }

      //
      // Bulk write method
      // -------------------------------------------------
      var bulkWrite = function() {
        db.collection('t2_5').insertMany([{c:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);
  
          db.collection('t2_5').bulkWrite({
            operations: [
                { insert: { a: 1 } }
              , { updateOne: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
              , { updateMany: { q: {a:2}, u: {$set: {a:2}}, upsert:true } }
              , { removeOne: { q: {c:1} } }
              , { removeMany: { q: {c:1} } }]
            , ordered: true
          }, {w:1}, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.nInserted);
            test.equal(1, r.nUpserted);
            test.equal(1, r.nRemoved);

            // Crud fields
            test.equal(1, r.insertedCount);
            test.equal(1, r.matchedCount);
            test.equal(0, r.modifiedCount);
            test.equal(1, r.removedCount);
            test.equal(1, r.upsertedCount);
            test.equal(1, r.upsertedIds.length);

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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
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
          
          db.collection('t3_2').updateOne({
              filter: { a: 1 }
            , update: { $set: { a: 1 } }
            , upsert: true
          }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.n);
            test.equal(1, r.matchedCount);
            test.equal(1, r.modifiedCount);
            test.ok(r.upsertedId != null);

            db.collection('t3_2').updateOne({
                filter: { c: 1 }
              , update: { $set: { a: 1 } }
            }, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.result.n);
              test.equal(1, r.matchedCount);
              test.equal(1, r.modifiedCount);
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
        db.collection('t3_3').replaceOne({
            filter: { a: 1 }
          , replacement: { a : 2 }
          , upsert: true
        }, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);
          test.equal(1, r.matchedCount);
          test.equal(1, r.modifiedCount);
          test.ok(r.upsertedId != null);

          db.collection('t3_3').replaceOne({
              filter: { a: 2 }
            , replacement: { a : 3 }
            , upsert: true
          }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.n);
            test.ok(r.result.upserted == null);

            test.equal(1, r.matchedCount);
            test.equal(1, r.modifiedCount);
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
  
          db.collection('t3_4').updateMany({
              filter: { a: 1 }
            , update: { $set: { a: 2 } }
            , upsert: true
          }, {w:1}, function(err, r) {
            test.equal(null, err);
            test.equal(2, r.result.n);
            test.equal(2, r.matchedCount);
            test.equal(2, r.modifiedCount);
            test.ok(r.upsertedId == null);

            db.collection('t3_4').updateMany({
                filter: { c: 1 }
              , update: { $set: { d: 2 } }
              , upsert: true
            }, {w:1}, function(err, r) {
              test.equal(null, err);
              test.equal(1, r.matchedCount);
              test.equal(1, r.modifiedCount);
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
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

            removeOne();
          });
        });
      }

      //
      // Update one method
      // -------------------------------------------------
      var removeOne = function() {
        db.collection('t4_2').insertMany([{a:1}, {a:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          db.collection('t4_2').removeOne({
            filter: { a: 1 }
          }, function(err, r) {
            test.equal(null, err);
            test.equal(1, r.result.n);
            test.equal(1, r.removedCount);
            
            removeMany();
          });
        });
      }

      //
      // Update many method
      // -------------------------------------------------
      var removeMany = function() {
        db.collection('t4_3').insertMany([{a:1}, {a:1}], {w:1}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          db.collection('t4_3').removeMany({
            filter: { a: 1 }
          }, function(err, r) {
            test.equal(null, err);
            test.equal(2, r.result.n);
            test.equal(2, r.removedCount);
            
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
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
          
          db.collection('t5_1').findOneAndRemove({
              filter: {a:1}
            , projection: {b:1}
            , sort: {a:1}
          }, function(err, r) {
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
          
          db.collection('t5_2').findOneAndReplace({
              filter: {a:1}
            , replacement: {c:1, b:1}
            , projection: {b:1, c:1}
            , sort: {a:1}
            , returnReplaced: true
            , upsert: true
          }, function(err, r) {
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
          
          db.collection('t5_3').findOneAndUpdate({
              filter: {a:1}
            , update: {$set: {d:1}}
            , projection: {b:1, d:1}
            , sort: {a:1}
            , returnReplaced: true
            , upsert: true
          }, function(err, r) {
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

/**
 * @ignore
 */
exports['should correctly execute distinct method using crud api'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {

      db.collection('t6').insert([{a:1, b:0}, {a:1, b:1}, {a:1, b:2}, {a:1}], function(err) {
        test.equal(null, err);

        db.collection('t6').distinct({
            fieldName: 'b'
          , filter: {a:1}
          , maxTimeMS: 100
        }, function(err, result) {
          test.equal(null, err);
          test.equal(0, result[0]);
          test.equal(1, result[1]);
          test.equal(2, result[2]);

          db.close();
          test.done();
        });
      });
    });
  }
}

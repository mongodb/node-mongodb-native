"use strict";

/**
 * @ignore
 */
exports.shouldCorrectlyExtractIndexInformation = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_index_information', function(err, collection) {
        collection.insert({a:1}, {w:1}, function(err, ids) {
          // Create an index on the collection
          db.createIndex(collection.collectionName, 'a', {w:1}, function(err, indexName) {
            test.equal(null, err);
            test.equal("a_1", indexName);

            // Let's fetch the index information
            db.indexInformation(collection.collectionName, function(err, collectionInfo) {
              test.equal(null, err);
              test.ok(collectionInfo['_id_'] != null);
              test.equal('_id', collectionInfo['_id_'][0][0]);
              test.ok(collectionInfo['a_1'] != null);
              test.deepEqual([["a", 1]], collectionInfo['a_1']);

              db.indexInformation(collection.collectionName, function(err, collectionInfo2) {
                var count1 = 0, count2 = 0;
                // Get count of indexes
                for(var i in collectionInfo) { count1 += 1;}
                for(var i in collectionInfo2) { count2 += 1;}

                // Tests
                test.ok(count2 >= count1);
                test.ok(collectionInfo2['_id_'] != null);
                test.equal('_id', collectionInfo2['_id_'][0][0]);
                test.ok(collectionInfo2['a_1'] != null);
                test.deepEqual([["a", 1]], collectionInfo2['a_1']);
                test.ok((collectionInfo[indexName] != null));
                test.deepEqual([["a", 1]], collectionInfo[indexName]);

                // Let's close the db
                db.close();
                test.done();
              });
            });
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleColumnIndexes = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_multiple_index_cols', function(err, collection) {
        collection.insert({a:1}, function(err, ids) {
          // Create an index on the collection
          db.createIndex(collection.collectionName, [['a', -1], ['b', 1], ['c', -1]], {w:1}, function(err, indexName) {
            test.equal("a_-1_b_1_c_-1", indexName);
            // Let's fetch the index information
            db.indexInformation(collection.collectionName, function(err, collectionInfo) {
              var count1 = 0;
              // Get count of indexes
              for(var i in collectionInfo) { count1 += 1;}

              // Test
              test.equal(2, count1);
              test.ok(collectionInfo[indexName] != null);
              test.deepEqual([['a', -1], ['b', 1], ['c', -1]], collectionInfo[indexName]);

              // Let's close the db
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleUniqueIndex = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single'} },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Create a non-unique index and test inserts
      db.createCollection('test_unique_index', function(err, collection) {
        db.createIndex(collection.collectionName, 'hello', {w:1}, function(err, indexName) {
          // Insert some docs
          collection.insert([{'hello':'world'}, {'hello':'mike'}, {'hello':'world'}], {w:1}, function(err, errors) {
            test.equal(null, err);

            // Create a unique index and test that insert fails
            db.createCollection('test_unique_index2', function(err, collection) {
              db.createIndex(collection.collectionName, 'hello', {unique:true, w:1}, function(err, indexName) {
                // Insert some docs
                collection.insert([{'hello':'world'}, {'hello':'mike'}, {'hello':'world'}], {w:1}, function(err, ids) {
                  test.ok(err != null);
                  test.equal(11000, err.code);
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

/**
 * @ignore
 */
exports.shouldCorrectlyCreateSubfieldIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Create a non-unique index and test inserts
      db.createCollection('test_index_on_subfield', function(err, collection) {
        collection.insert([{'hello': {'a':4, 'b':5}}, {'hello': {'a':7, 'b':2}}, {'hello': {'a':4, 'b':10}}], {w:1}, function(err, ids) {
          test.equal(null, err);

          // Create a unique subfield index and test that insert fails
          db.createCollection('test_index_on_subfield2', function(err, collection) {
            
            db.createIndex(collection.collectionName, 'hello_a', {w:1, unique:true}, function(err, indexName) {
              test.equal(null, err)
              
              collection.insert([{'hello': {'a':4, 'b':5}}, {'hello': {'a':7, 'b':2}}, {'hello': {'a':4, 'b':10}}], {w:1}, function(err, ids) {
                // Assert that we have erros
                test.ok(err != null);
                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyDropIndexes = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_drop_indexes', function(err, collection) {
        collection.insert({a:1}, {w:1}, function(err, ids) {
          // Create an index on the collection
          db.createIndex(collection.collectionName, 'a', {w:1}, function(err, indexName) {
            test.equal("a_1", indexName);
            // Drop all the indexes
            collection.dropAllIndexes(function(err, result) {
              test.equal(true, result);

              collection.indexInformation(function(err, result) {
                test.ok(result['a_1'] == null);
                db.close();
                test.done();
              })
            })
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldThrowErrorOnAttemptingSafeCreateIndexWithNoCallback = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldThrowErrorOnAttemptingSafeUpdateWithNoCallback', function(err, collection) {
        try {
          // insert a doc
          collection.createIndex({a:1}, {w:1});
          test.ok(false);
        } catch(err) {}

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldThrowErrorOnAttemptingSafeEnsureIndexWithNoCallback = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldThrowErrorOnAttemptingSafeUpdateWithNoCallback', function(err, collection) {
        try {
          // insert a doc
          collection.ensureIndex({a:1}, {w:1});
          test.ok(false);
        } catch(err) {}

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexes = {
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_distinct_queries', function(err, collection) {
        collection.insert([{'a':0, 'b':{'c':'a'}},
          {'a':1, 'b':{'c':'b'}},
          {'a':1, 'b':{'c':'c'}},
          {'a':2, 'b':{'c':'a'}}, {'a':3}, {'a':3}], {w:1}, function(err, ids) {
            collection.distinct('a', function(err, docs) {
              test.deepEqual([0, 1, 2, 3], docs.sort());
            });

            collection.distinct('b.c', function(err, docs) {
              test.deepEqual(['a', 'b', 'c'], docs.sort());
              db.close();
              test.done();
            });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteEnsureIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_ensure_index', function(err, collection) {
        // Create an index on the collection
        db.ensureIndex(collection.collectionName, 'a', {w:1}, function(err, indexName) {
          test.equal("a_1", indexName);
          // Let's fetch the index information
          db.indexInformation(collection.collectionName, function(err, collectionInfo) {
            test.ok(collectionInfo['_id_'] != null);
            test.equal('_id', collectionInfo['_id_'][0][0]);
            test.ok(collectionInfo['a_1'] != null);
            test.deepEqual([["a", 1]], collectionInfo['a_1']);

            db.ensureIndex(collection.collectionName, 'a', {w:1}, function(err, indexName) {
              test.equal("a_1", indexName);
              // Let's fetch the index information
              db.indexInformation(collection.collectionName, function(err, collectionInfo) {
                test.ok(collectionInfo['_id_'] != null);
                test.equal('_id', collectionInfo['_id_'][0][0]);
                test.ok(collectionInfo['a_1'] != null);
                test.deepEqual([["a", 1]], collectionInfo['a_1']);
                // Let's close the db
                db.close();
                test.done();
              });
            });
          });
        });
      })
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCreateAndUseSparseIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('create_and_use_sparse_index_test', function(err, r) {
        db.collection('create_and_use_sparse_index_test', function(err, collection) {

          collection.ensureIndex({title:1}, {sparse:true, w:1}, function(err, indexName) {
            collection.insert([{name:"Jim"}, {name:"Sarah", title:"Princess"}], {w:1}, function(err, result) {
              collection.find({title:{$ne:null}}).sort({title:1}).toArray(function(err, items) {
                test.equal(1, items.length);
                test.equal("Sarah", items[0].name);

                // Fetch the info for the indexes
                collection.indexInformation({full:true}, function(err, indexInfo) {
                  test.equal(null, err);
                  test.equal(2, indexInfo.length);
                  db.close();
                  test.done();
                })
              })
            });
          })
        })
      })
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleGeospatialIndexes = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">1.9.1", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('geospatial_index_test', function(err, r) {
        db.collection('geospatial_index_test', function(err, collection) {
          collection.ensureIndex({loc:'2d'}, {w:1}, function(err, indexName) {
            collection.insert({'loc': [-100,100]}, {w:1}, function(err, result) {
              test.equal(err,null);
              collection.insert({'loc': [200,200]}, {w:1}, function(err, result) {
                err = err ? err : {};
                test.ok(err.message.indexOf("point not in interval of") != -1);
                test.ok(err.message.indexOf("-180") != -1);
                test.ok(err.message.indexOf("180") != -1);
                db.close();
                test.done();
              });
            });
           });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleGeospatialIndexesAlteredRange = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">1.9.1", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('geospatial_index_altered_test', function(err, r) {
        db.collection('geospatial_index_altered_test', function(err, collection) {
          collection.ensureIndex({loc:'2d'},{min:0,max:1024, w:1}, function(err, indexName) {
            collection.insert({'loc': [100,100]}, {w:1}, function(err, result) {
              test.equal(err,null);
              collection.insert({'loc': [200,200]}, {w:1}, function(err, result) {
                test.equal(err,null);
                collection.insert({'loc': [-200,-200]}, {w:1}, function(err, result) {
                  err = err ? err : {};
                  test.ok(err.message.indexOf("point not in interval of") != -1);
                  test.ok(err.message.indexOf("0") != -1);
                  test.ok(err.message.indexOf("1024") != -1);
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

/**
 * @ignore
 */
exports.shouldThrowDuplicateKeyErrorWhenCreatingIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldThrowDuplicateKeyErrorWhenCreatingIndex', function(err, collection) {
        collection.insert([{a:1}, {a:1}], {w:1}, function(err, result) {
          test.equal(null, err);

          collection.ensureIndex({a:1}, {unique:true, w:1}, function(err, indexName) {
            test.ok(err != null);
            db.close();
            test.done();
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldThrowDuplicateKeyErrorWhenDriverInStrictMode = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:true});
    // Establish connection to db
    db.open(function(err, db) {
      db.createCollection('shouldThrowDuplicateKeyErrorWhenDriverInStrictMode', function(err, collection) {
        collection.insert([{a:1}, {a:1}], {w:1}, function(err, result) {
          test.equal(null, err);

          collection.ensureIndex({a:1}, {unique:true, w:1}, function(err, indexName) {
            test.ok(err != null);
            db.close();
            test.done();
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyUseMinMaxForSettingRangeInEnsureIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Establish connection to db
      db.createCollection('shouldCorrectlyUseMinMaxForSettingRangeInEnsureIndex', function(err, collection) {
        test.equal(null, err);

        collection.ensureIndex({loc:'2d'}, {min:200, max:1400, w:1}, function(err, indexName) {
          test.equal(null, err);

          collection.insert({loc:[600, 600]}, {w:1}, function(err, result) {
            test.equal(null, err);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly create an index with overriden name'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Establish connection to db
      db.createCollection('shouldCorrectlyCreateAnIndexWithOverridenName', function(err, collection) {
        test.equal(null, err);

        collection.ensureIndex("name", {name: "myfunky_name"}, function(err, indexName) {
          test.equal(null, err);

          // Fetch full index information
          collection.indexInformation({full:false}, function(err, indexInformation) {
            test.ok(indexInformation['myfunky_name'] != null);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

exports['should handle index declarations using objects from other contexts'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var shared = require('./contexts');

      db.collection('indexcontext').ensureIndex(shared.object, { safe: true, background: true }, function (err) {
        test.equal(null, err);
        db.collection('indexcontext').ensureIndex(shared.array, { safe: true, background: true }, function (err) {
          test.equal(null, err);
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['should correctly return error message when applying unique index to duplicate documents'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection("should_throw_error_due_to_duplicates");
      collection.insert([{a:1}, {a:1}, {a:1}], {w:1}, function(err, result) {
        test.equal(null, err);

        collection.ensureIndex({a:1}, {w:1, unique:true}, function(err, result) {
          test.ok(err != null);
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['should correctly drop index with no callback'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection("should_correctly_drop_index");
      collection.insert([{a:1}], {w:1}, function(err, result) {
        test.equal(null, err);

        collection.ensureIndex({a:1}, {w:1}, function(err, result) {
          collection.dropIndex("a_1")

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['should correctly apply hint to find'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection("should_correctly_apply_hint");
      collection.insert([{a:1}], {w:1}, function(err, result) {
        test.equal(null, err);

        collection.ensureIndex({a:1}, {w:1}, function(err, result) {
          test.equal(null, err);

          collection.indexInformation({full:false}, function(err, indexInformation) {
            test.equal(null, err);

            collection.find({}, {hint:"a_1"}).toArray(function(err, docs) {
              test.equal(null, err);
              test.equal(1, docs[0].a);
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

exports['should correctly set language_override option'] = {
  metadata: { requires: { mongodb: ">=2.6.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection("should_correctly_set_language_override");
      collection.insert([{text:'Lorem ipsum dolor sit amet.', langua:'italian'}], function(err, result) {
        test.equal(null, err);

        collection.ensureIndex({text:'text'}, {language_override:'langua', name:'language_override_index'}, function(err, result) {
          test.equal(null, err);

          collection.indexInformation({full:true}, function(err, indexInformation) {
            test.equal(null, err);
            for (var i = 0; i < indexInformation.length; i++) {
              if (indexInformation[i].name === 'language_override_index')
                test.equal(indexInformation[i].language_override, 'langua')
            }

            db.close();
            test.done();

          });
        });
      });
    });
  }
}

exports['should correctly use listIndexes to retrieve index list'] = {
  metadata: { requires: { mongodb: ">=2.4.0", topology: ['single', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.collection('testListIndexes').ensureIndex({a:1}, function(err, r) {
        test.equal(null, err);

        // Get the list of indexes
        db.collection('testListIndexes').listIndexes().toArray(function(err, indexes) {
          test.equal(null, err);
          test.equal(2, indexes.length);

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['should correctly ensureIndex for nested style index name c.d'] = {
  metadata: { requires: { mongodb: ">=2.4.0", topology: ['single', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.collection('ensureIndexWithNestedStyleIndex').ensureIndex({'c.d':1}, function(err, r) {
        test.equal(null, err);

        // Get the list of indexes
        db.collection('ensureIndexWithNestedStyleIndex').listIndexes().toArray(function(err, indexes) {
          test.equal(null, err);
          test.equal(2, indexes.length);

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['should correctly pass back error on duplicate index with fullResult'] = {
  metadata: { requires: { mongodb: ">=2.4.0", topology: ['single', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
      
      var col = db.collection('testduplicateWithFullResult');
      col.ensureIndex({a:1}, {unique:true}, function(err, r) {
        test.equal(null, err);

        col.insert({a:1}, { fullResult: true }, function(err, doc) {
          test.equal(null, err);
        
          col.insert({a:1}, { fullResult: true }, function(err, doc) {
            test.ok(err != null);
        
            db.close();
            test.done();
          });
        });
      });
    });
  }
}
var Step = require('step');

/**
 * Test a simple find
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleFind = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_simple', function(err, r) {
      var collection = db.collection('test_find_simple', function(err, collection) {
        var doc1 = null;
        var doc2 = null;

        // Insert some test documents
        collection.insert([{a:2}, {b:3}], {w:1}, function(err, docs) {
          doc1 = docs[0];
          doc2 = docs[1]

          // Ensure correct insertion testing via the cursor and the count function
          collection.find().toArray(function(err, documents) {
            test.equal(2, documents.length);

            collection.count(function(err, count) {
              test.equal(2, count);

              // Fetch values by selection
              collection.find({'a': doc1.a}).toArray(function(err, documents) {
                test.equal(1, documents.length);
                test.equal(doc1.a, documents[0].a);
                // Let's close the db
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

/**
 * Test a simple find chained
 * @ignore
 */
exports.shouldCorrectlyPeformSimpleChainedFind = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_simple_chained', function(err, r) {
      var collection = db.collection('test_find_simple_chained', function(err, collection) {
        var doc1 = null;
        var doc2 = null;

        // Insert some test documents
        collection.insert([{a:2}, {b:3}], {w:1}, function(err, docs) {
          doc1 = docs[0];
          doc2 = docs[1]

          // Ensure correct insertion testing via the cursor and the count function
          collection.find().toArray(function(err, documents) {
            test.equal(2, documents.length);

            collection.count(function(err, count) {
              test.equal(2, count);

              // Fetch values by selection
              collection.find({'a': doc1.a}).toArray(function(err, documents) {
                test.equal(1, documents.length);
                test.equal(doc1.a, documents[0].a);
                // Let's close the db
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

/**
 * Test advanced find
 * @ignore
 */
exports.shouldCorrectlyPeformAdvancedFinds = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_advanced', function(err, r) {
      var collection = db.collection('test_find_advanced', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null;

        // Insert some test documents
        collection.insert([{a:1}, {a:2}, {b:3}], {w:1}, function(err, docs) {
          var doc1 = docs[0], doc2 = docs[1], doc3 = docs[2];

          // Locate by less than
          collection.find({'a':{'$lt':10}}).toArray(function(err, documents) {
            test.equal(2, documents.length);
            // Check that the correct documents are returned
            var results = [];
            // Check that we have all the results we want
            documents.forEach(function(doc) {
              if(doc.a == 1 || doc.a == 2) results.push(1);
            });
            test.equal(2, results.length);
          });

          // Locate by greater than
          collection.find({'a':{'$gt':1}}).toArray(function(err, documents) {
            test.equal(1, documents.length);
            test.equal(2, documents[0].a);
          });

          // Locate by less than or equal to
          collection.find({'a':{'$lte':1}}).toArray(function(err, documents) {
            test.equal(1, documents.length);
            test.equal(1, documents[0].a);
          });

          // Locate by greater than or equal to
          collection.find({'a':{'$gte':1}}).toArray(function(err, documents) {
            test.equal(2, documents.length);
            // Check that the correct documents are returned
            var results = [];
            // Check that we have all the results we want
            documents.forEach(function(doc) {
              if(doc.a == 1 || doc.a == 2) results.push(1);
            });
            test.equal(2, results.length);
          });

          // Locate by between
          collection.find({'a':{'$gt':1, '$lt':3}}).toArray(function(err, documents) {
            test.equal(1, documents.length);
            test.equal(2, documents[0].a);
          });

          // Locate in clause
          collection.find({'a':{'$in':[1,2]}}).toArray(function(err, documents) {
            test.equal(2, documents.length);
            // Check that the correct documents are returned
            var results = [];
            // Check that we have all the results we want
            documents.forEach(function(doc) {
              if(doc.a == 1 || doc.a == 2) results.push(1);
            });
            test.equal(2, results.length);
          });

          // Locate in _id clause
          collection.find({'_id':{'$in':[doc1['_id'], doc2['_id']]}}).toArray(function(err, documents) {
            test.equal(2, documents.length);
            // Check that the correct documents are returned
            var results = [];
            // Check that we have all the results we want
            documents.forEach(function(doc) {
              if(doc.a == 1 || doc.a == 2) results.push(1);
            });
            test.equal(2, results.length);
            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * Test sorting of results
 * @ignore
 */
exports.shouldCorrectlyPerformFindWithSort = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_sorting', function(err, r) {
      db.collection('test_find_sorting', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null, doc4 = null;
        // Insert some test documents
        collection.insert([{a:1, b:2},
            {a:2, b:1},
            {a:3, b:2},
            {a:4, b:1}
          ], {w:1}, function(err, docs) {
            doc1 = docs[0];
            doc2 = docs[1];
            doc3 = docs[2];
            doc4 = docs[3]

            // Test sorting (ascending)
            collection.find({'a': {'$lt':10}}, {'sort': [['a', 1]]}).toArray(function(err, documents) {
              test.equal(4, documents.length);
              test.equal(1, documents[0].a);
              test.equal(2, documents[1].a);
              test.equal(3, documents[2].a);
              test.equal(4, documents[3].a);

              // Test sorting (descending)
              collection.find({'a': {'$lt':10}}, {'sort': [['a', -1]]}).toArray(function(err, documents) {
                test.equal(4, documents.length);
                test.equal(4, documents[0].a);
                test.equal(3, documents[1].a);
                test.equal(2, documents[2].a);
                test.equal(1, documents[3].a);

                // Test sorting (descending), sort is hash
                collection.find({'a': {'$lt':10}}, {sort: {a: -1}}).toArray(function(err, documents) {
                  test.equal(4, documents.length);
                  test.equal(4, documents[0].a);
                  test.equal(3, documents[1].a);
                  test.equal(2, documents[2].a);
                  test.equal(1, documents[3].a);

                  // Sorting using array of names, assumes ascending order
                  collection.find({'a': {'$lt':10}}, {'sort': ['a']}).toArray(function(err, documents) {
                    test.equal(4, documents.length);
                    test.equal(1, documents[0].a);
                    test.equal(2, documents[1].a);
                    test.equal(3, documents[2].a);
                    test.equal(4, documents[3].a);

                    // Sorting using single name, assumes ascending order
                    collection.find({'a': {'$lt':10}}, {'sort': 'a'}).toArray(function(err, documents) {
                      test.equal(4, documents.length);
                      test.equal(1, documents[0].a);
                      test.equal(2, documents[1].a);
                      test.equal(3, documents[2].a);
                      test.equal(4, documents[3].a);

                      // Sorting using single name, assumes ascending order, sort is hash
                      collection.find({'a': {'$lt':10}}, {sort: {'a':1}}).toArray(function(err, documents) {
                        test.equal(4, documents.length);
                        test.equal(1, documents[0].a);
                        test.equal(2, documents[1].a);
                        test.equal(3, documents[2].a);
                        test.equal(4, documents[3].a);

                        collection.find({'a': {'$lt':10}}, {'sort': ['b', 'a']}).toArray(function(err, documents) {
                          test.equal(4, documents.length);
                          test.equal(2, documents[0].a);
                          test.equal(4, documents[1].a);
                          test.equal(1, documents[2].a);
                          test.equal(3, documents[3].a);

                          // Sorting using empty array, no order guarantee should not blow up
                          collection.find({'a': {'$lt':10}}, {'sort': []}).toArray(function(err, documents) {
                            test.equal(4, documents.length);

                            /* NONACTUAL */
                            // Sorting using ordered hash
                            collection.find({'a': {'$lt':10}}, {'sort': {a:-1}}).toArray(function(err, documents) {
                              // Fail test if not an error
                              test.equal(4, documents.length);
                              // Let's close the db
                              db.close();
                              test.done();
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
        });
      });
    });
  });
}

/**
 * Test the limit function of the db
 * @ignore
 */
exports.shouldCorrectlyPerformFindWithLimit = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_limits', function(err, r) {
      db.collection('test_find_limits', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null, doc4 = null;

        // Insert some test documents
        collection.insert([{a:1},
            {b:2},
            {c:3},
            {d:4}
          ], {w:1}, function(err, docs) {
            doc1 = docs[0];
            doc2 = docs[1];
            doc3 = docs[2];
            doc4 = docs[3]

            // Test limits
            collection.find({}, {'limit': 1}).toArray(function(err, documents) {
              test.equal(1, documents.length);
            });

            collection.find({}, {'limit': 2}).toArray(function(err, documents) {
              test.equal(2, documents.length);
            });

            collection.find({}, {'limit': 3}).toArray(function(err, documents) {
              test.equal(3, documents.length);
            });

            collection.find({}, {'limit': 4}).toArray(function(err, documents) {
              test.equal(4, documents.length);
            });

            collection.find({}, {}).toArray(function(err, documents) {
              test.equal(4, documents.length);
            });

            collection.find({}, {'limit':99}).toArray(function(err, documents) {
              test.equal(4, documents.length);
              // Let's close the db
              db.close();
              test.done();
            });
        });
      });
    });
  });
}

/**
 * Test find by non-quoted values (issue #128)
 * @ignore
 */
exports.shouldCorrectlyFindWithNonQuotedValues = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_non_quoted_values', function(err, r) {
      db.collection('test_find_non_quoted_values', function(err, collection) {
        // insert test document
        collection.insert([{ a: 19, b: 'teststring', c: 59920303 },
                           { a: "19", b: 'teststring', c: 3984929 }], {w:1} , function(err, r) {

           collection.find({ a: 19 }).toArray(function(err, documents) {
             test.equal(1, documents.length);
             db.close();
             test.done();
           });
        });
      });
    });
  });
}

/**
 * Test for querying embedded document using dot-notation (issue #126)
 * @ignore
 */
exports.shouldCorrectlyFindEmbeddedDocument = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_embedded_document', function(err, r) {
      db.collection('test_find_embedded_document', function(err, collection) {
        // insert test document
        collection.insert([{ a: { id: 10, value: 'foo' }, b: 'bar', c: { id: 20, value: 'foobar' }},
                           { a: { id: 11, value: 'foo' }, b: 'bar2', c: { id: 20, value: 'foobar' }}], {w:1}, function(err, r) {

           // test using integer value
           collection.find({ 'a.id': 10 }).toArray(function(err, documents) {
             test.equal(1, documents.length);
             test.equal('bar', documents[0].b);
           });

           // test using string value
           collection.find({ 'a.value': 'foo' }).toArray(function(err, documents) {
             // should yield 2 documents
             test.equal(2, documents.length);
             test.equal('bar', documents[0].b);
             test.equal('bar2', documents[1].b);
             db.close();
             test.done();
           });
        });
      });
    });
  });
}

/**
 * Find no records
 * @ignore
 */
exports.shouldCorrectlyFindNoRecords = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_one_no_records', function(err, r) {
      db.collection('test_find_one_no_records', function(err, collection) {
        collection.find({'a':1}, {}).toArray(function(err, documents) {
          test.equal(0, documents.length);
          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformFindByWhere = function(configuration, test) {
  var Code = configuration.getMongoPackage().Code;
  
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_where', function(err, collection) {
      collection.insert([{'a':1}, {'a':2}, {'a':3}], {w:1}, function(err, ids) {
        collection.count(function(err, count) {
          test.equal(3, count);

          // Let's test usage of the $where statement
          collection.find({'$where':new Code('this.a > 2')}).count(function(err, count) {
            test.equal(1, count);
          });

          collection.find({'$where':new Code('this.a > i', {i:1})}).count(function(err, count) {
            test.equal(2, count);

            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformFindsWithHintTurnedOn = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_hint', function(err, collection) {
      collection.insert({'a':1}, {w:1}, function(err, ids) {
        db.createIndex(collection.collectionName, "a", {w:1}, function(err, indexName) {
          collection.find({'a':1}, {'hint':'a'}).toArray(function(err, items) {
            test.equal(1, items.length);
          });

          collection.find({'a':1}, {'hint':['a']}).toArray(function(err, items) {
            test.equal(1, items.length);
          });

          collection.find({'a':1}, {'hint':{'a':1}}).toArray(function(err, items) {
            test.equal(1, items.length);
          });

          // Modify hints
          collection.hint = 'a_1';
          test.equal('a_1', collection.hint);
          collection.find({'a':1}).toArray(function(err, items) {
            test.equal(1, items.length);
          });

          collection.hint = ['a'];
          test.equal(1, collection.hint['a']);
          collection.find({'a':1}).toArray(function(err, items) {
            test.equal(1, items.length);
          });

          collection.hint = {'a':1};
          test.equal(1, collection.hint['a']);
          collection.find({'a':1}).toArray(function(err, items) {
            test.equal(1, items.length);
          });

          collection.hint = null;
          test.ok(collection.hint == null);
          collection.find({'a':1}).toArray(function(err, items) {
            test.equal(1, items.length);
            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformFindByObjectID = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;
  
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_by_oid', function(err, collection) {
      collection.save({'hello':'mike'}, {w:1}, function(err, docs) {
        test.ok(docs._id instanceof ObjectID || Object.prototype.toString.call(docs._id) === '[object ObjectID]');

        collection.findOne({'_id':docs._id}, function(err, doc) {
          test.equal('mike', doc.hello);

          var id = doc._id.toString();
          collection.findOne({'_id':new ObjectID(id)}, function(err, doc) {
            test.equal('mike', doc.hello);
            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReturnDocumentWithOriginalStructure= function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_by_oid_with_subdocs', function(err, collection) {
      var c1 = { _id: new ObjectID, comments: [], title: 'number 1' };
      var c2 = { _id: new ObjectID, comments: [], title: 'number 2' };
      var doc = {
          numbers: []
        , owners: []
        , comments: [c1, c2]
        , _id: new ObjectID
      };

      collection.insert(doc, {w:1}, function(err, docs) {
        collection.findOne({'_id':doc._id}, {w:1,fields: undefined}, function(err, doc) {
          if (err) console.error('error', err);
          test.equal(2, doc.comments.length);
          test.equal('number 1', doc.comments[0].title);
          test.equal('number 2', doc.comments[1].title);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleRecord = function(configuration, test) {
  var p_client = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  p_client.open(function(err, p_client) {
    p_client.createCollection('test_should_correctly_retrieve_one_record', function(err, collection) {
      collection.insert({'a':0}, {w:1}, function(err, r) {
        p_client.collection('test_should_correctly_retrieve_one_record', function(err, usercollection) {
          usercollection.findOne({'a': 0}, function(err, result) {
            p_client.close();

            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleError = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_one_error_handling', function(err, collection) {
      // Try to fetch an object using a totally invalid and wrong hex string... what we're interested in here
      // is the error handling of the findOne Method
      try {
        collection.findOne({"_id":ObjectID.createFromHexString('5e9bd59248305adf18ebc15703a1')}, function(err, result) {});
      } catch (err) {
        db.close();
        test.done();
      }
    });
  });
}

/**
 * Test field select with options
 * @ignore
 */
exports.shouldCorrectlyPerformFindWithOptions = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_field_select_with_options', function(err, r) {
      var collection = db.collection('test_field_select_with_options', function(err, collection) {
        var docCount = 25, docs = [];

        // Insert some test documents
        while(docCount--) docs.push({a:docCount, b:docCount});
        collection.insert(docs, {w:1}, function(err,retDocs) {
          docs = retDocs;

          collection.find({},{ 'a' : 1},{ limit : 3, sort : [['a',-1]] }).toArray(function(err,documents){
            test.equal(3,documents.length);
            documents.forEach(function(doc,idx){
              test.equal(undefined,doc.b); // making sure field select works
              test.equal((24-idx),doc.a); // checking limit sort object with field select
            });
          });

          collection.find({},{},10,3).toArray(function(err,documents){
            test.equal(3,documents.length);
            documents.forEach(function(doc,idx){
              test.equal(doc.a,doc.b); // making sure empty field select returns properly
              test.equal((14-idx),doc.a); // checking skip and limit in args
            });

            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * Test findAndModify a document
 * @ignore
 */
exports.shouldCorrectlyFindAndModifyDocument = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_and_modify_a_document', function(err, collection) {
      // Test return new document on change
      collection.insert({'a':1, 'b':2}, {w:1}, function(err, doc) {
        // Let's modify the document in place
        collection.findAndModify({'a':1}, [['a', 1]], {'$set':{'b':3}}, {'new':true}, function(err, updated_doc) {
          test.equal(1, updated_doc.a);
          test.equal(3, updated_doc.b);

          // Test return old document on change
          collection.insert({'a':2, 'b':2}, {w:1}, function(err, doc) {
            // Let's modify the document in place
            collection.findAndModify({'a':2}, [['a', 1]], {'$set':{'b':3}}, {w:1}, function(err, result, object) {
              test.equal(2, result.a);
              test.equal(2, result.b);

              // Test remove object on change
              collection.insert({'a':3, 'b':2}, {w:1}, function(err, doc) {
                // Let's modify the document in place
                collection.findAndModify({'a':3}, [], {'$set':{'b':3}}, {'new': true, remove: true}, function(err, updated_doc) {
                  test.equal(3, updated_doc.a);
                  test.equal(2, updated_doc.b);

                  // Let's upsert!
                  collection.findAndModify({'a':4}, [], {'$set':{'b':3}}, {'new': true, upsert: true}, function(err, updated_doc) {
                    test.equal(4, updated_doc.a);
                    test.equal(3, updated_doc.b);

                    // Test selecting a subset of fields
                    collection.insert({a: 100, b: 101}, {w:1}, function (err, ids) {
                      collection.findAndModify({'a': 100}, [], {'$set': {'b': 5}}, {'new': true, fields: {b: 1}}, function (err, updated_doc) {
                        test.equal(2, Object.keys(updated_doc).length);
                        test.equal(ids[0]['_id'].toHexString(), updated_doc._id.toHexString());
                        test.equal(5, updated_doc.b);
                        test.equal("undefined", typeof updated_doc.a);
                        db.close();
                        test.done();
                      });
                    });
                  });
                })
              });
            })
          });
        })
      });
    });
  });
}

/**
 * Test findAndModify a document with fields
 * @ignore
 */
exports.shouldCorrectlyFindAndModifyDocumentAndReturnSelectedFieldsOnly = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_find_and_modify_a_document', function(err, collection) {
      // Test return new document on change
      collection.insert({'a':1, 'b':2}, {w:1}, function(err, doc) {
        // Let's modify the document in place
        collection.findAndModify({'a':1}, [['a', 1]], {'$set':{'b':3}}, {'new':true, 'fields': {a:1}}, function(err, updated_doc) {
          test.equal(2, Object.keys(updated_doc).length);
          test.equal(1, updated_doc.a);
          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * Test findAndModify a document with no write concern set
 * @ignore
 */
exports.shouldCorrectlyFindAndModifyWithNoGetLastErrorChainedW0 = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyFindAndModifyWithNoGetLastErrorChained', function(err, collection) {
      // Let's modify the document in place
      collection.findAndModify({'a':1}, [['a', 1]], {'$set':{'b':3}}, {'new':true, 'fields': {a:1}, w:0}, function(err, updated_doc) {
        db.close();
        test.done();
      });

      // Check if we have a chained command or not
      var ids = db.serverConfig._callBackStore.notRepliedToIds();
      test.equal(1, ids.length);
      test.ok(db.serverConfig._callBackStore.callbackInfo(ids[0].chained) == undefined);
    });
  });
}

exports.shouldCorrectlyFindAndModifyWithNoGetLastErrorChainedSafe = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyFindAndModifyWithNoGetLastErrorChainedSafe', function(err, collection) {
      // Let's modify the document in place
      collection.findAndModify({'a':1}, [['a', 1]], {'$set':{'b':3}}, {'new':true, 'fields': {a:1}, safe:false}, function(err, updated_doc) {
        db.close();
        test.done();
      });

      // Check if we have a chained command or not
      var ids = db.serverConfig._callBackStore.notRepliedToIds();
      test.ok(db.serverConfig._callBackStore.callbackInfo(ids[0].chained) == undefined);
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteFindOneWithAnInSearchTag = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyExecuteFindOneWithAnInSearchTag', function(err, collection) {
      // Test return new document on change
      collection.insert({'tags':[]}, {w:1}, function(err, docs) {
        // Fetch the id
        var id = docs[0]._id

        Step(
          function findFirst() {
            var self = this;

            collection.findOne({_id:id}, function(err, doc) {
              test.equal(null, err)
              test.ok(doc != null);

              // Perform atomic push operation
              collection.update({_id:id}, {'$push':{comments:{title:'1'}}}, {w:1}, self);
            })
          },

          function findSecond(err, result) {
            var self = this;
            test.equal(1, result);
            test.equal(null, err);

            collection.findOne({_id:id}, function(err, doc) {
              test.equal(null, err)
              test.ok(doc != null);
              test.deepEqual(1, doc.comments.length);

              // Perform atomic push operation
              collection.update({_id:id}, {'$push':{comments:{title:'2'}}}, {w:1}, self);
            })
          },

          function findThird(err, result) {
            var self = this;
            test.equal(1, result);
            test.equal(null, err);

            collection.findOne({_id:id}, function(err, doc) {
              test.equal(null, err)
              test.ok(doc != null);
              test.deepEqual(2, doc.comments.length);

              // Perform atomic push operation
              collection.update({_id:id}, {'$push':{comments:{title:'3'}}}, {w:1}, self);
            })
          },

          function findFourth(err, result) {
            var self = this;
            test.equal(1, result);
            test.equal(null, err);

            collection.findOne({_id:id}, function(err, doc) {
              test.equal(null, err)
              test.ok(doc != null);
              test.deepEqual(3, doc.comments.length);
              // Perform atomic push operation
              collection.update({_id:id}, {'$pushAll':{comments:[{title:'4'}, {title:'5'}]}}, {w:1}, self);
            })
          },

          function findFourth(err, result) {
            var self = this;
            test.equal(1, result);
            test.equal(null, err);

            collection.findOne({_id:id}, function(err, doc) {
              test.equal(null, err)
              test.ok(doc != null);
              test.deepEqual(5, doc.comments.length);
              db.close();
              test.done();
            })
          }
        )
      })
    });
  });
}

/**
 * @ignore
 */
exports['ShouldCorrectlyLocatePostAndIncValues'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyExecuteFindOneWithAnInSearchTag', function(err, collection) {
      // Test return new document on change
      collection.insert({title:'Tobi',
          author:'Brian',
          newTitle:'Woot', meta:{visitors:0}}, {w:1}, function(err, docs) {
        // Fetch the id
        var id = docs[0]._id

        collection.update({_id:id}, {$inc:{ 'meta.visitors': 1 }}, {w:1}, function(err, result) {
          test.equal(1, result);
          test.equal(null, err);

          collection.findOne({_id:id}, function(err, item) {
            test.equal(1, item.meta.visitors);
            db.close();
            test.done()
          })
        });
      });
    });
  });
}

/**
 * Test findAndModify a document
 * @ignore
 */
exports['Should Correctly Handle FindAndModify Duplicate Key Error'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('FindAndModifyDuplicateKeyError', function(err, collection) {
      collection.ensureIndex(['name', 1], {unique:true, w:1}, function(err, index) {
        // Test return new document on change
        collection.insert([{name:'test1'}, {name:'test2'}], {w:1}, function(err, doc) {
          // Let's modify the document in place
          collection.findAndModify({name: 'test1'}, [], {$set: {name: 'test2'}}, {}, function(err, updated_doc) {
            test.equal(null, updated_doc);
            test.ok(err != null);
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly return null when attempting to modify a non-existing document'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('AttemptToFindAndModifyNonExistingDocument', function(err, collection) {
      // Let's modify the document in place
      collection.findAndModify({name: 'test1'}, [], {$set: {name: 'test2'}}, {}, function(err, updated_doc) {
        test.equal(null, updated_doc);
        test.ok(err == null || err.errmsg.match("No matching object found"))
        db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly handle chained skip and limit on find with toArray'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('skipAndLimitOnFindWithToArray', function(err, collection) {
      collection.insert([{a:1}, {b:2}, {c:3}], {w:1}, function(err, result) {

        collection.find().skip(1).limit(-1).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(1, items.length);
          test.equal(2, items[0].b)
          db.close();
          test.done();
        })
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly handle chained skip and negative limit on find with toArray'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('skipAndNegativeLimitOnFindWithToArray', function(err, collection) {
      collection.insert([{a:1}, {b:2}, {c:3}, {d:4}, {e:5}], {w:1}, function(err, result) {

        collection.find().skip(1).limit(-3).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(3, items.length);
          test.equal(2, items[0].b)
          test.equal(3, items[1].c)
          test.equal(4, items[2].d)
          db.close();
          test.done();
        })
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly pass timeout options to cursor'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('timeoutFalse', function(err, collection) {
      collection.find({},{timeout:false},function(err, cursor) {
        test.equal(false, cursor.timeout);
      });
      collection.find({},{timeout:true},function(err, cursor) {
        test.equal(true, cursor.timeout);
      });
      collection.find({},{},function(err, cursor) {
        test.equal(true, cursor.timeout);
      });

      db.close();
      test.done();
    });
  });
}

/**
 * Test findAndModify a document with strict mode enabled
 * @ignore
 */
exports.shouldCorrectlyFindAndModifyDocumentWithDBStrict = function(configuration, test) {
  var p_client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
  p_client.open(function(err, p_client) {
    p_client.createCollection('shouldCorrectlyFindAndModifyDocumentWithDBStrict', function(err, collection) {
      // Test return old document on change
      collection.insert({'a':2, 'b':2}, {w:1}, function(err, doc) {
        // Let's modify the document in place
        collection.findAndModify({'a':2}, [['a', 1]], {'$set':{'b':3}}, {new:true}, function(err, result) {
          test.equal(2, result.a)
          test.equal(3, result.b)
          p_client.close();
          test.done();
        })
      });
    });
  });
}

/**
 * Test findAndModify a document that fails in first step before safe
 * @ignore
 */
exports.shouldCorrectlyFindAndModifyDocumentThatFailsInFirstStep = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyFindAndModifyDocumentThatFailsInFirstStep', function(err, collection) {
      // Set up an index to force duplicate index erro
      collection.ensureIndex([['failIndex', 1]], {unique:true, w:1}, function(err, index) {
        // Setup a new document
        collection.insert({'a':2, 'b':2, 'failIndex':2}, {w:1}, function(err, doc) {

          // Let's attempt to upsert with a duplicate key error
          collection.findAndModify({'c':2}, [['a', 1]], {'a':10, 'b':10, 'failIndex':2}, {w:1, upsert:true}, function(err, result) {
            test.equal(null, result);
            test.ok(err.errmsg.match("duplicate key error index"));
            db.close();
            test.done();
          })
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly return new modified document'] = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('Should_correctly_return_new_modified_document', function(err, collection) {
      var id = new ObjectID();
      var doc = {_id:id, a:1, b:1, c:{a:1, b:1}};

      collection.insert(doc, {w:1}, function(err, result) {
        test.ok(err == null);

        // Find and modify returning the new object
        collection.findAndModify({_id:id}, [], {$set : {'c.c': 100}}, {new:true}, function(err, item) {
          test.equal(doc._id.toString(), item._id.toString());
          test.equal(doc.a, item.a);
          test.equal(doc.b, item.b);
          test.equal(doc.c.a, item.c.a);
          test.equal(doc.c.b, item.c.b);
          test.equal(100, item.c.c);
          db.close();
          test.done();
        })
      });
    });
  });
}

/**
 * Should correctly execute findAndModify that is breaking in prod
 * @ignore
 */
exports.shouldCorrectlyExecuteFindAndModify = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyExecuteFindAndModify', function(err, collection) {
      var self = {_id : new ObjectID()}
      var _uuid = 'sddffdss'

      collection.findAndModify(
           {_id: self._id, 'plays.uuid': _uuid},
           [],
           {$set : {'plays.$.active': true}},
           {new: true, fields: {plays: 0, results: 0}, safe: true},
         function(err, contest) {
           db.close();
           test.done();
         })
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly return record with 64-bit id'] = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID
    , Long = configuration.getMongoPackage().Long;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('should_correctly_return_record_with_64bit_id', function(err, collection) {
      var _lowerId = new ObjectID();
      var _higherId = new ObjectID();
      var lowerId = new Long.fromString('133118461172916224', 10);
      var higherId = new Long.fromString('133118461172916225', 10);

      var lowerDoc = {_id:_lowerId, id: lowerId};
      var higherDoc = {_id:_higherId, id: higherId};

      collection.insert([lowerDoc, higherDoc], {w:1}, function(err, result) {
        test.ok(err == null);

        // Select record with id of 133118461172916225 using $gt directive
        collection.find({id: {$gt:  lowerId}}, {}).toArray(function(err, arr) {
          test.ok(err == null);
          test.equal(arr.length, 1, 'Selecting record via $gt directive on 64-bit integer should return a record with higher Id')
          test.equal(arr[0].id.toString(), '133118461172916225', 'Returned Id should be equal to 133118461172916225')
          db.close();
          test.done()
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should Correctly find a Document using findOne excluding _id field'] = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;
  var p_client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
  p_client.open(function(err, p_client) {
    p_client.createCollection('Should_Correctly_find_a_Document_using_findOne_excluding__id_field', function(err, collection) {
      var doc = {_id : new ObjectID(), a:1, c:2}
      // insert doc
      collection.insert(doc, {w:1}, function(err, result) {
        // Get one document, excluding the _id field
        collection.findOne({a:1}, {fields:{'_id': 0}}, function(err, item) {
          test.equal(null, item._id);
          test.equal(1, item.a);
          test.equal(2, item.c);

          collection.find({a:1}, {fields:{'_id':0}}).toArray(function(err, items) {
            var item = items[0]
            test.equal(null, item._id);
            test.equal(1, item.a);
            test.equal(2, item.c);
            p_client.close();
            test.done();
          })
        })
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly execute find and findOne queries in the same way'] = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('Should_correctly_execute_find_and_findOne_queries_in_the_same_way', function(err, collection) {
      var doc = {_id : new ObjectID(), a:1, c:2, comments:[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]};
      // insert doc
      collection.insert(doc, {w:1}, function(err, result) {

        collection.find({_id: doc._id}, {comments: {$slice: -5}}).toArray(function(err, docs) {
          test.equal(5, docs[0].comments.length)

          collection.findOne({_id: doc._id}, {comments: {$slice: -5}}, function(err, item) {
            test.equal(5, item.comments.length)
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly execute find and findOne queries with selector set to null'] = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('Should_correctly_execute_find_and_findOne_queries_in_the_same_way', function(err, collection) {
      var doc = {_id : new ObjectID(), a:1, c:2, comments:[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]};
      // insert doc
      collection.insert(doc, {w:1}, function(err, result) {

        collection.find(null, {comments: {$slice: -5}}).toArray(function(err, docs) {
          test.equal(5, docs[0].comments.length)

          collection.findOne(null, {comments: {$slice: -5}}, function(err, item) {
            test.equal(5, item.comments.length)
            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandlerErrorForFindAndModifyWhenNoRecordExists = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyHandlerErrorForFindAndModifyWhenNoRecordExists', function(err, collection) {
      collection.findAndModify({'a':1}, [], {'$set':{'b':3}}, {'new': true}, function(err, updated_doc) {
        test.equal(null, err);
        test.equal(null, updated_doc);
        db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteFindAndModifyShouldGenerateCorrectBSON = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;  

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var transaction = {};
    transaction.document = {};
    transaction.document.type = "documentType";
    transaction.document.id = new ObjectID();
    transaction.transactionId = new ObjectID();
    transaction.amount = 12.3333

    var transactions = [];
    transactions.push(transaction);
    // Wrapping object
    var wrapingObject = {
      funds : {
        remaining : 100.5
      },

      transactions:transactions
    }

    db.createCollection('shouldCorrectlyExecuteFindAndModify', function(err, collection) {
      collection.insert(wrapingObject, {w:1}, function(err, doc) {
        test.equal(null, err);

        collection.findOne({_id:doc[0]._id, 'funds.remaining': {$gte: 3.0}, 'transactions.id': {$ne: transaction.transactionId}}, function(err, item) {
          test.ok(item != null)

          collection.findAndModify({_id:doc[0]._id, 'funds.remaining': {$gte: 3.0}, 'transactions.id': {$ne: transaction.transactionId}}, [], {$push: {transactions: transaction}}, {new: true, safe: true}, function(err, result) {
            db.close();
            test.done();
          });
        })
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteMultipleFindsInParallel = function(configuration, test) {
  var p_client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
  p_client.open(function(err, p_client) {
    p_client.createCollection('tasks', function(err, collection) {
      var numberOfOperations = 0;

      // Test return old document on change
      collection.insert({'a':2, 'b':2}, {w:1}, function(err, doc) {
        collection.find({"user_id":"4e9fc8d55883d90100000003","lc_status":{"$ne":"deleted"},"owner_rating":{"$exists":false}},
          {"skip":0,"limit":10,"sort":{"updated":-1}}).count(function(err, count) {
          numberOfOperations = numberOfOperations + 1;
          if(numberOfOperations == 2) {
            test.done();
            p_client.close();
          }
        })

        collection.find({"user_id":"4e9fc8d55883d90100000003","lc_status":{"$ne":"deleted"},"owner_rating":{"$exists":false}},
          {"skip":0,"limit":10,"sort":{"updated":-1}}).count(function(err, count) {
          numberOfOperations = numberOfOperations + 1;
          if(numberOfOperations == 2) {
            test.done();
            p_client.close();
          }
        })
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReturnErrorFromMongodbOnFindAndModifyForcedError = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldCorrectlyReturnErrorFromMongodbOnFindAndModifyForcedError', function(err, collection) {
      var q = { x: 1 };
      var set = { y:2, _id: new ObjectID() };
      var opts = { new: true, upsert: true };
      // Original doc
      var doc = {_id: new ObjectID(), x:1};

      // Insert original doc
      collection.insert(doc, {w:1}, function(err, result) {
        collection.findAndModify(q, [], set, opts, function (err, res) {
          test.ok(err != null);
          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteFindAndModifyUnderConcurrentLoad = function(configuration, test) {
  var ObjectID = configuration.getMongoPackage().ObjectID;
  var p_client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
  var running = true;

  p_client.open(function(err, p_client) {
    // Create a collection
    p_client.collection("collection1", function(err, collection) {
      // Wait a bit and then execute something that will throw a duplicate error
      setTimeout(function() {
        var id = new ObjectID();

        collection.insert({_id:id, a:1}, {w:1}, function(err, result) {
          test.equal(null, err);

          collection.insert({_id:id, a:1}, {w:1}, function(err, result) {
            running = false;
            test.done();
            p_client.close();
          });
        });
      }, 200);
    });

    p_client.collection("collection2", function(err, collection) {
      // Keep hammering in inserts
      var insert = function() {
        process.nextTick(function() {
          collection.insert({a:1});
          if(running) process.nextTick(insert);
        });
      }
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyIterateOverCollection = function(configuration, test) {
  var p_client = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
  var numberOfSteps = 0;

  // Open db connection
  p_client.open(function(err, p_client) {
    // Create a collection
    p_client.createCollection('shouldCorrectlyIterateOverCollection', function(err, collection) {
      for(var i = 0; i < 1000; i++) {
        collection.insert({a:1, b:2, c:{d:3, f:'sfdsffffffffffffffffffffffffffffff'}});
      }

      var cursor = collection.find({}, {});
      cursor.count(function(err,count) {
        cursor.each(function(err, obj) {
         if (obj == null) {
           p_client.close();
           test.equal(1000, numberOfSteps);
           test.done();
         } else {
           numberOfSteps = numberOfSteps + 1;
         }
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyErrorOutFindAndModifyOnDuplicateRecord = function(configuration, test) {
  var p_client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
  p_client.open(function(err, p_client) {
    p_client.createCollection('shouldCorrectlyErrorOutFindAndModifyOnDuplicateRecord', function(err, collection) {
      // Test return old document on change
      collection.insert([{'login':'user1'}, {'login':'user2'}], {w:1}, function(err, docs) {
        var id = docs[1]._id;
        // Set an index
        collection.ensureIndex('login', {unique:true, w:1}, function(err, result) {
          // Attemp to modify document
          collection.findAndModify({_id: id}, [], { $set: {login: 'user1'} }, {}, function(err, user){
            test.ok(err != null);
            p_client.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * An example of using find with a very large in parameter
 *
 * @ignore
 */
exports.shouldPerformSimpleFindInArray = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_find_in_array', function(err, collection) {
      test.equal(null, err);

      var docs = [];
      for(var i = 0; i < 100; i++) docs.push({a:i});

      // Insert some test documentations
      collection.insert(docs, {w:1}, function(err, result) {
        test.equal(null, err);

        // Find all the variables in a specific array
        var inArray = [];
        for(var i = 0; i < 100; i++) docs.push(i);

        // Fin all in
        collection.find({a:{$in:docs}}).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(100, items.length);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * A whole set of different ways to use the findAndModify command.
 *
 * The first findAndModify command modifies a document and returns the modified document back.
 * The second findAndModify command removes the document.
 * The second findAndModify command upserts a document and returns the new document.
 * @_class collection
 * @_function findAndModify
 */
exports.shouldPerformSimpleFindAndModifyOperations = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_find_and_modify_operations_', function(err, collection) {
      test.equal(null, err);

      // Insert some test documentations
      collection.insert([{a:1}, {b:1}, {c:1}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Simple findAndModify command returning the new document
        collection.findAndModify({a:1}, [['a', 1]], {$set:{b1:1}}, {new:true}, function(err, doc) {
          test.equal(null, err);
          test.equal(1, doc.a);
          test.equal(1, doc.b1);

          // Simple findAndModify command returning the new document and
          // removing it at the same time
          collection.findAndModify({b:1}, [['b', 1]],
            {$set:{b:2}}, {remove:true}, function(err, doc) {

            // Verify that the document is gone
            collection.findOne({b:1}, function(err, item) {
              test.equal(null, err);
              test.equal(null, item);

              // Simple findAndModify command performing an upsert and returning the new document
              // executing the command safely
              collection.findAndModify({d:1}, [['b', 1]],
                {d:1, f:1}, {new:true, upsert:true, w:1}, function(err, doc) {
                  test.equal(null, err);
                  test.equal(1, doc.d);
                  test.equal(1, doc.f);

                  db.close();
                  test.done();
              })
            });
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * An example of using findAndRemove
 *
 * @_class collection
 * @_function findAndRemove
 */
exports.shouldPerformSimpleFindAndRemove = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_find_and_modify_operations_2', function(err, collection) {
      test.equal(null, err);

      // Insert some test documentations
      collection.insert([{a:1}, {b:1, d:1}, {c:1}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Simple findAndModify command returning the old document and
        // removing it at the same time
        collection.findAndRemove({b:1}, [['b', 1]], function(err, doc) {
          test.equal(null, err);
          test.equal(1, doc.b);
          test.equal(1, doc.d);

          // Verify that the document is gone
          collection.findOne({b:1}, function(err, item) {
            test.equal(null, err);
            test.equal(null, item);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple query using the find method on the collection.
 *
 * @_class collection
 * @_function find
 */
exports.shouldPeformASimpleQuery = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_query', function(err, collection) {
      test.equal(null, err);

      // Insert a bunch of documents for the testing
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find().toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(3, docs.length);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple query showing the explain for a query
 *
 * @_class collection
 * @_function find
 */
exports.shouldPeformASimpleExplainQuery = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_explain_query', function(err, collection) {
      test.equal(null, err);

      // Insert a bunch of documents for the testing
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find({}, {explain:true}).toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(1, docs.length);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple query showing skip and limit
 *
 * @_class collection
 * @_function find
 */
exports.shouldPeformASimpleLimitSkipQuery = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_limit_skip_query', function(err, collection) {
      test.equal(null, err);

      // Insert a bunch of documents for the testing
      collection.insert([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find({}, {skip:1, limit:1, fields:{b:1}}).toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(1, docs.length);
          test.equal(null, docs[0].a);
          test.equal(2, docs[0].b);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

exports.shouldReturnInstanceofErrorWithBadFieldSelection = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  db.open(function(err, db) {
    test.equal(null, err);

    var col = db.collection('bad_field_selection');
    col.insert([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], {w:1}, function(err, result) {
      test.equal(null, err);

      col.find({}, {skip:1, limit:1, fields:{_id:1,b:0}}).toArray(function(err, docs) {
        test.ok(err instanceof Error);
        db.close();
        test.done();
      });
    });
  });
}

/**
 * A simple query using findOne
 *
 * @_class collection
 * @_function findOne
 */
exports.shouldPeformASimpleLimitSkipFindOneQuery = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_limit_skip_find_one_query', function(err, collection) {
      test.equal(null, err);

      // Insert a bunch of documents for the testing
      collection.insert([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.findOne({a:2}, {fields:{b:1}}, function(err, doc) {
          test.equal(null, err);
          test.equal(null, doc.a);
          test.equal(2, doc.b);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple query using find and fields
 */
exports.shouldPeformASimpleLimitSkipFindWithFields = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_find_with_fields', function(err, collection) {
      test.equal(null, err);

      // Insert a bunch of documents for the testing
      collection.insert([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find({a:2}, ['b']).toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(1, docs.length);
          test.equal(null, docs[0].a);
          test.equal(2, docs[0].b);

          // Peform a simple find and return all the documents
          collection.find({a:2}, {b:1}).toArray(function(err, docs) {
            test.equal(null, err);
            test.equal(1, docs.length);
            test.equal(null, docs[0].a);
            test.equal(2, docs[0].b);

            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * A simple query using find and fields
 */
exports.shouldPeformASimpleLimitSkipFindWithFields2 = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('simple_find_with_fields_2', function(err, collection) {
      test.equal(null, err);

      // Insert a bunch of documents for the testing
      collection.insert([{a:1, b:1}, {a:2, b:2}, {a:3, b:3}], {w:1}, function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find({a:2}, {fields: ['b']}).toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(1, docs.length);
          test.equal(null, docs[0].a);
          test.equal(2, docs[0].b);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * A simple query with a different batchSize
 */
exports.shouldPerformQueryWithBatchSizeDifferentToStandard = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.createCollection('shouldPerformQueryWithBatchSizeDifferentToStandard', function(err, collection) {
      test.equal(null, err);

      var docs = [];
      for(var i = 0; i < 1000; i++) {
        docs.push({a:i});
      }

      // Insert a bunch of documents for the testing
      collection.insert(docs, {w:1}, function(err, result) {
        test.equal(null, err);

        // Peform a simple find and return all the documents
        collection.find({}, {batchSize:1000}).toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(1000, docs.length);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * A simple query with a different batchSize
 */
exports.shouldQueryCurrentOperation = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.collection('$cmd.sys.inprog', function(err, collection) {
      // Peform a simple find and return all the documents
      collection.find({}).toArray(function(err, docs) {
        test.ok(Array.isArray(docs[0].inprog));
        db.close();
        test.done();
      });
    });
  });
}

/**
 * A simple query with negative limit
 */
exports.shouldCorrectlyPerformNegativeLimit = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.collection('shouldCorrectlyPerformNegativeLimit', function(err, collection) {
      var docs = [];
      for(var i = 0; i < 1000; i++) {
        docs.push({a:1, b:"helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld"})
      }

      // Insert a bunch of documents
      collection.insert(docs, {w:1}, function(err, result) {
        // Peform a simple find and return all the documents
        collection.find({}).limit(-10).toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(10, docs.length);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * Should perform an exhaust find query
 */
exports.shouldCorrectlyExecuteExhaustQuery = function(configuration, test) {
  var Binary = configuration.getMongoPackage().Binary;
  var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection we want to drop later
    db.collection('shouldCorrectlyExecuteExhaustQuery', function(err, collection) {
      var docs = [];
      for(var i = 0; i < 4000; i++) {
        docs.push({
          a: 1,
          b: "helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld",
          c: new Binary(new Buffer(1024))
        })
      }

      // Insert a bunch of documents
      collection.insert(docs, {w:1}, function(err, result) {
        // Peform a simple find and return all the documents
        collection.find({}, {exhaust:true}).toArray(function(err, docs2) {
          test.equal(null, err);
          test.equal(docs.length, docs2.length)

          db.close();
          test.done();
        });
      });
    });
  });
}

exports['Readpreferences should work fine when using a single server instance'] = function(configuration, test) {
  var ReadPreference = configuration.getMongoPackage().ReadPreference;
  var db = configuration.newDbInstance({w:0, readPreference:ReadPreference.PRIMARY_PREFERRED}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {
    test.equal(null, err);

    var docs = [];
    for(var i = 0; i < 1; i++) {
      docs.push({
        a: 1,
        b: "helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld helloworld",
      })
    }

    // Create a collection we want to drop later
    db.collection('Readpreferencesshouldworkfine', function(err, collection) {
      // Insert a bunch of documents
      collection.insert(docs, {w:1}, function(err, result) {
        // Peform a simple find and return all the documents
        collection.find({}, {exhaust:true}).toArray(function(err, docs2) {
          test.equal(null, err);
          test.equal(docs.length, docs2.length)

          db.close();
          test.done();
        });
      });
    });
  });
}

exports['Each should not hang on iterating over no results'] = function(configuration, test) {
  var ReadPreference = configuration.getMongoPackage().ReadPreference;
  var db = configuration.newDbInstance({w:0, readPreference:ReadPreference.PRIMARY_PREFERRED}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {
    test.equal(null, err);
    // Create a collection we want to drop later
    db.collection('noresultAvailableForEachToIterate', function(err, collection) {
      // Peform a simple find and return all the documents
      collection.find({}).each(function(err, item) {
        test.equal(null, item);

        db.close();
        test.done();
      });
    });
  });
}

exports.shouldCorrectlyFindDocumentsByRegExp = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
    // the original regex invalid, and leads to segmentation fault.
    db.createCollection('test_regex_serialization', function(err, collection) {
      collection.insert({keywords: ["test", "segmentation", "fault", "regex", "serialization", "native"]}, {w:1}, function(err, r) {
        
        var count = 20,
            run = function(i) {
              // search by regex            
              collection.findOne({keywords: {$all: [/ser/, /test/, /seg/, /fault/, /nat/]}}, function(err, item) {            
                test.equal(6, item.keywords.length);              
                
                if(i === 0) {
                  db.close()
                  test.done()
                }
              });
            };
        // loop a few times to catch the / in trailing chars case
        while (count--) {
          run(count);
        }
      });      
    });
  });
}

exports.shouldCorrectlyDoFindMinMax = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    // Serialized regexes contain extra trailing chars. Sometimes these trailing chars contain / which makes
    // the original regex invalid, and leads to segmentation fault.
    db.createCollection('shouldCorrectlyDoFindMinMax', function(err, collection) {
      collection.insert({"_id": 123, "name": "some name", "min": 1, "max": 10}, {w:1}, function(err, doc) {
        test.equal(null, err);

        collection.find({"_id": {$in:['some', 'value', 123]}}, {"_id":1, "max":1}, {}).toArray(function(err, docs) {        
          test.equal(null, err);
          test.equal(10, docs[0].max)

          collection.find({"_id": {$in:['some', 'value', 123]}}, {fields: {"_id":1, "max":1}}).toArray(function(err, docs) {        
            test.equal(null, err);
            test.equal(10, docs[0].max)

            db.close();
            test.done();
          });
        });
      });
    });
  });
}
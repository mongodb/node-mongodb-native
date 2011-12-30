var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../tools/gleak'),
  Step = require('../deps/step/lib/step'),
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Code = require('../lib/mongodb/bson/code').Code,
  Long = require('../lib/mongodb/goog/math/long').Long,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var POOL_SIZE = 4;
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: POOL_SIZE, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    client.open(function(err, db_p) {
      if(numberOfTestsRun == Object.keys(tests).length) {
        // If first test drop the db
        client.dropDatabase(function(err, done) {
          callback();
        });                
      } else {
        return callback();        
      }      
    });
  },
  
  tearDown: function(callback) {
    numberOfTestsRun = numberOfTestsRun - 1;
    // Drop the database and close it
    if(numberOfTestsRun <= 0) {
      // client.dropDatabase(function(err, done) {
        client.close();
        callback();
      // });        
    } else {
      client.close();
      callback();        
    }      
  },
  
  // Test a simple find
  shouldCorrectlyPerformSimpleFind : function(test) {    
    client.createCollection('test_find_simple', function(err, r) {
      var collection = client.collection('test_find_simple', function(err, collection) {
        var doc1 = null;
        var doc2 = null;
  
        // Insert some test documents
        collection.insert([{a:2}, {b:3}], {safe:true}, function(err, docs) {
          doc1 = docs[0]; 
          doc2 = docs[1]
  
          // Ensure correct insertion testing via the cursor and the count function
          collection.find(function(err, cursor) {
            cursor.toArray(function(err, documents) {
              test.equal(2, documents.length);
  
              collection.count(function(err, count) {
                test.equal(2, count);
  
                // Fetch values by selection
                collection.find({'a': doc1.a}, function(err, cursor) {
                  cursor.toArray(function(err, documents) {
                    test.equal(1, documents.length);
                    test.equal(doc1.a, documents[0].a);
                    // Let's close the db
                    test.done();
                  });
                });
              });
            })
          });          
        });
      });
    });    
  },
  
  // Test a simple find chained
  shouldCorrectlyPeformSimpleChainedFind : function(test) {
    client.createCollection('test_find_simple_chained', function(err, r) {
      var collection = client.collection('test_find_simple_chained', function(err, collection) {
        var doc1 = null;
        var doc2 = null;
  
        // Insert some test documents
        collection.insert([{a:2}, {b:3}], {safe:true}, function(err, docs) {
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
                test.done();
              });
            });
          });
        });
      });
    });    
  },
  
  // Test advanced find
  shouldCorrectlyPeformAdvancedFinds : function(test) {
    client.createCollection('test_find_advanced', function(err, r) {
      var collection = client.collection('test_find_advanced', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null;
  
        // Insert some test documents
        collection.insert([{a:1}, {a:2}, {b:3}], {safe:true}, function(err, docs) {
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
            test.done();
          });
        });
      });
    });    
  },
  
  // Test sorting of results
  shouldCorrectlyPerformFindWithSort : function(test) {
    client.createCollection('test_find_sorting', function(err, r) {
      client.collection('test_find_sorting', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null, doc4 = null;
        // Insert some test documents
        collection.insert([{a:1, b:2},
            {a:2, b:1},
            {a:3, b:2},
            {a:4, b:1}
          ], {safe:true}, function(err, docs) {
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
  },
  
  // Test the limit function of the db
  shouldCorrectlyPerformFindWithLimit : function(test) {
    client.createCollection('test_find_limits', function(err, r) {
      client.collection('test_find_limits', function(err, collection) {
        var doc1 = null, doc2 = null, doc3 = null, doc4 = null;
  
        // Insert some test documents
        collection.insert([{a:1},
            {b:2},
            {c:3},
            {d:4}
          ], {safe:true}, function(err, docs) {
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
              test.done();
            });
        });  
      });
    });    
  },
  
  // Test find by non-quoted values (issue #128)
  shouldCorrectlyFindWithNonQuotedValues : function(test) {
    client.createCollection('test_find_non_quoted_values', function(err, r) {
      client.collection('test_find_non_quoted_values', function(err, collection) {
        // insert test document
        collection.insert([{ a: 19, b: 'teststring', c: 59920303 },
                           { a: "19", b: 'teststring', c: 3984929 }], {safe:true} , function(err, r) {
                             
           collection.find({ a: 19 }).toArray(function(err, documents) {
             test.equal(1, documents.length);
             test.done();
           });
        });        
      });
    });    
  },
  
  // Test for querying embedded document using dot-notation (issue #126)
  shouldCorrectlyFindEmbeddedDocument : function(test) {
    client.createCollection('test_find_embedded_document', function(err, r) {
      client.collection('test_find_embedded_document', function(err, collection) {
        // insert test document
        collection.insert([{ a: { id: 10, value: 'foo' }, b: 'bar', c: { id: 20, value: 'foobar' }},
                           { a: { id: 11, value: 'foo' }, b: 'bar2', c: { id: 20, value: 'foobar' }}], {safe:true}, function(err, r) {
                             
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
             test.done();
           });
        });        
      });
    });    
  },
  
  // Find no records
  shouldCorrectlyFindNoRecords : function(test) {
    client.createCollection('test_find_one_no_records', function(err, r) {
      client.collection('test_find_one_no_records', function(err, collection) {
        collection.find({'a':1}, {}).toArray(function(err, documents) {
          test.equal(0, documents.length);
          // Let's close the db
          test.done();
        });
      });
    });    
  },
  
  shouldCorrectlyPerformFindByWhere : function(test) {
    client.createCollection('test_where', function(err, collection) {
      test.ok(collection instanceof Collection);
      collection.insert([{'a':1}, {'a':2}, {'a':3}], {safe:true}, function(err, ids) {
        collection.count(function(err, count) {
          test.equal(3, count);
  
          // Let's test usage of the $where statement
          collection.find({'$where':new Code('this.a > 2')}).count(function(err, count) {
            test.equal(1, count);
          });
  
          collection.find({'$where':new Code('this.a > i', {i:1})}).count(function(err, count) {
            test.equal(2, count);
  
            // Let's close the db
            test.done();
          });
        });
      });
    });
  },  
  
  shouldCorrectlyPerformFindsWithHintTurnedOn : function(test) {
    client.createCollection('test_hint', function(err, collection) {
      collection.insert({'a':1}, {safe:true}, function(err, ids) {
        client.createIndex(collection.collectionName, "a", function(err, indexName) {
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
          collection.hint = 'a';
          test.equal(1, collection.hint['a']);
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
            test.done();
          });
        });
      });
    });
  },  
  
  shouldCorrectlyPerformFindByObjectID : function(test) {
    client.createCollection('test_find_by_oid', function(err, collection) {
      collection.save({'hello':'mike'}, {safe:true}, function(err, docs) {
        test.ok(docs._id instanceof ObjectID || Object.prototype.toString.call(docs._id) === '[object ObjectID]');
  
        collection.findOne({'_id':docs._id}, function(err, doc) {
          test.equal('mike', doc.hello);
  
          var id = doc._id.toString();
          collection.findOne({'_id':new ObjectID(id)}, function(err, doc) {
            test.equal('mike', doc.hello);
            // Let's close the db
            test.done();
          });
        });
      });
    });
  },
  
  shouldCorrectlyReturnDocumentWithOriginalStructure: function(test) {
    client.createCollection('test_find_by_oid_with_subdocs', function(err, collection) {
      var c1 = { _id: new ObjectID, comments: [], title: 'number 1' };
      var c2 = { _id: new ObjectID, comments: [], title: 'number 2' };
      var doc = {
          numbers: []
        , owners: []
        , comments: [c1, c2]
        , _id: new ObjectID
      };
      
      collection.insert(doc, {safe:true}, function(err, docs) {
        collection.findOne({'_id':doc._id}, {safe:true,fields: undefined}, function(err, doc) {
          if (err) console.error('error', err);
          test.equal(2, doc.comments.length);
          test.equal('number 1', doc.comments[0].title);
          test.equal('number 2', doc.comments[1].title);
  
          test.done();
        });
      });
    });
  },
  
  shouldCorrectlyRetrieveSingleRecord : function(test) {
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    p_client.open(function(err, p_client) {
      client.createCollection('test_should_correctly_retrieve_one_record', function(err, collection) {
        collection.insert({'a':0}, {safe:true}, function(err, r) {
          p_client.collection('test_should_correctly_retrieve_one_record', function(err, usercollection) {
            usercollection.findOne({'a': 0}, function(err, result) {
              p_client.close();
  
              test.done();
            });
          });          
        });  
      });
    });
  }, 
  
  shouldCorrectlyHandleError : function(test) {
    client.createCollection('test_find_one_error_handling', function(err, collection) {
      // Try to fetch an object using a totally invalid and wrong hex string... what we're interested in here
      // is the error handling of the findOne Method
      try {
        collection.findOne({"_id":ObjectID.createFromHexString('5e9bd59248305adf18ebc15703a1')}, function(err, result) {});
      } catch (err) {
        test.done();
      }
    });
  },   
  
  // Test field select with options
  shouldCorrectlyPerformFindWithOptions : function(test) {
    client.createCollection('test_field_select_with_options', function(err, r) {
      var collection = client.collection('test_field_select_with_options', function(err, collection) {
        var docCount = 25, docs = [];
  
        // Insert some test documents
        while(docCount--) docs.push({a:docCount, b:docCount});
        collection.insert(docs, {safe:true}, function(err,retDocs) { 
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
            
            test.done();
          });
        });  
      });
    });
  },
  
  // Test findAndModify a document
  shouldCorrectlyFindAndModifyDocument : function(test) {
    client.createCollection('test_find_and_modify_a_document', function(err, collection) {
      // Test return new document on change
      collection.insert({'a':1, 'b':2}, {safe:true}, function(err, doc) {
        // Let's modify the document in place
        collection.findAndModify({'a':1}, [['a', 1]], {'$set':{'b':3}}, {'new':true}, function(err, updated_doc) {
          test.equal(1, updated_doc.a);
          test.equal(3, updated_doc.b);
  
          // Test return old document on change
          collection.insert({'a':2, 'b':2}, {safe:true}, function(err, doc) {
            // Let's modify the document in place
            collection.findAndModify({'a':2}, [['a', 1]], {'$set':{'b':3}}, {safe:true}, function(err, result) {
              test.equal(2, result.a);
              test.equal(2, result.b);
  
              // Test remove object on change
              collection.insert({'a':3, 'b':2}, {safe:true}, function(err, doc) {
                // Let's modify the document in place
                collection.findAndModify({'a':3}, [], {'$set':{'b':3}}, {'new': true, remove: true}, function(err, updated_doc) {
                  test.equal(3, updated_doc.a);
                  test.equal(2, updated_doc.b);
  
                  // Let's upsert!
                  collection.findAndModify({'a':4}, [], {'$set':{'b':3}}, {'new': true, upsert: true}, function(err, updated_doc) {
                    test.equal(4, updated_doc.a);
                    test.equal(3, updated_doc.b);
  
                    // Test selecting a subset of fields
                    collection.insert({a: 100, b: 101}, {safe:true}, function (err, ids) {
                      collection.findAndModify({'a': 100}, [], {'$set': {'b': 5}}, {'new': true, fields: {b: 1}}, function (err, updated_doc) {
                        test.equal(2, Object.keys(updated_doc).length);
                        test.equal(ids[0]['_id'].toHexString(), updated_doc._id.toHexString());
                        test.equal(5, updated_doc.b);
                        test.equal("undefined", typeof updated_doc.a);
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
  },  
    
  shouldCorrectlyExecuteFindOneWithAnInSearchTag : function(test) {
    client.createCollection('shouldCorrectlyExecuteFindOneWithAnInSearchTag', function(err, collection) {
      // Test return new document on change
      collection.insert({'tags':[]}, {safe:true}, function(err, docs) {        
        // Fetch the id
        var id = docs[0]._id
        
        Step(
          function findFirst() {
            var self = this;
            
            collection.findOne({_id:id}, function(err, doc) {
              test.equal(null, err)
              test.ok(doc != null);
              
              // Perform atomic push operation
              collection.update({_id:id}, {'$push':{comments:{title:'1'}}}, {safe:true}, self);
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
              collection.update({_id:id}, {'$push':{comments:{title:'2'}}}, {safe:true}, self);
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
              collection.update({_id:id}, {'$push':{comments:{title:'3'}}}, {safe:true}, self);
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
              collection.update({_id:id}, {'$pushAll':{comments:[{title:'4'}, {title:'5'}]}}, {safe:true}, self);
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
              test.done();
            })
          }                          
        )
      })
    });
  },
  
  'ShouldCorrectlyLocatePostAndIncValues': function(test) {
    client.createCollection('shouldCorrectlyExecuteFindOneWithAnInSearchTag', function(err, collection) {
      // Test return new document on change
      collection.insert({title:'Tobi', 
          author:'Brian', 
          newTitle:'Woot', meta:{visitors:0}}, {safe:true}, function(err, docs) {        
        // Fetch the id
        var id = docs[0]._id
        
        collection.update({_id:id}, {$inc:{ 'meta.visitors': 1 }}, {safe:true}, function(err, result) {
          test.equal(1, result);
          test.equal(null, err);
          
          collection.findOne({_id:id}, function(err, item) {
            test.equal(1, item.meta.visitors);
            test.done()
          })          
        });
      });
    });
  },
  
  // Test findAndModify a document
  'Should Correctly Handle FindAndModify Duplicate Key Error' : function(test) {
    client.createCollection('FindAndModifyDuplicateKeyError', function(err, collection) {
      collection.ensureIndex(['name', 1], {unique:true}, function(err, index) {
        // Test return new document on change
        collection.insert([{name:'test1'}, {name:'test2'}], {safe:true}, function(err, doc) {
          // Let's modify the document in place
          collection.findAndModify({name: 'test1'}, [], {$set: {name: 'test2'}}, {}, function(err, updated_doc) {
            test.equal(null, updated_doc);
            test.ok(err != null);
            test.done();
          });
        });        
      });      
    });  
  },
  
  'Should correctly return null when attempting to modify a non-existing document' : function(test) {
    client.createCollection('AttemptToFindAndModifyNonExistingDocument', function(err, collection) {
      // Let's modify the document in place
      collection.findAndModify({name: 'test1'}, [], {$set: {name: 'test2'}}, {}, function(err, updated_doc) {
        test.equal(null, updated_doc);
        test.ok(err == null || err.errmsg.match("No matching object found"))
        test.done();
      });
    });  
  },
  
  'Should correctly handle chained skip and limit on find with toArray' : function(test) {
    client.createCollection('skipAndLimitOnFindWithToArray', function(err, collection) {
      collection.insert([{a:1}, {b:2}, {c:3}], {safe:true}, function(err, result) {
        
        collection.find().skip(1).limit(1).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(1, items.length);
          test.equal(2, items[0].b)
          test.done();
        })        
      });      
    });      
  },
  
  'Should correctly pass timeout options to cursor' : function(test) {
    client.createCollection('timeoutFalse', function(err, collection) {
      collection.find({},{timeout:false},function(err, cursor) {
        test.equal(false, cursor.timeout);
      });
      collection.find({},{timeout:true},function(err, cursor) {
        test.equal(true, cursor.timeout);
      });
      collection.find({},{},function(err, cursor) {
        test.equal(true, cursor.timeout);
      });
  
      test.done();
    });
  },
  
  // Test findAndModify a document with strict mode enabled
  shouldCorrectlyFindAndModifyDocumentWithDBStrict : function(test) {
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, ssl:useSSL}), {strict:true, native_parser: (process.env['TEST_NATIVE'] != null)});
    p_client.open(function(err, p_client) {
      p_client.createCollection('shouldCorrectlyFindAndModifyDocumentWithDBStrict', function(err, collection) {
        // Test return old document on change
        collection.insert({'a':2, 'b':2}, {safe:true}, function(err, doc) {
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
  },
  
  // Test findAndModify a document that fails in first step before safe
  shouldCorrectlyFindAndModifyDocumentThatFailsInFirstStep : function(test) {
    client.open(function(err, p_client) {
      client.createCollection('shouldCorrectlyFindAndModifyDocumentThatFailsInFirstStep', function(err, collection) {
        // Set up an index to force duplicate index erro
        collection.ensureIndex([['failIndex', 1]], {unique:true}, function(err, index) {
          // Setup a new document
          collection.insert({'a':2, 'b':2, 'failIndex':1}, function(err, doc) {
  
            // Let's attempt to upsert with a duplicate key error
            collection.findAndModify({'c':2}, [['a', 1]], {'a':10, 'b':10, 'failIndex':1}, {safe:true, upsert:true}, function(err, result) {
              test.equal(null, result);
              test.ok(err.errmsg.match("duplicate key error index"));
              p_client.close();
              test.done();
            })
          });
        });        
      });
    });
  },
    
  // Test findAndModify a document that fails in first step before safe
  shouldCorrectlyFindAndModifyDocumentThatFailsInSecondStepWithNoMatchingDocuments : function(test) {
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true}), {strict:true, native_parser: (process.env['TEST_NATIVE'] != null)});
    p_client.open(function(err, p_client) {
      p_client.createCollection('shouldCorrectlyFindAndModifyDocumentThatFailsInSecondStepWithNoMatchingDocuments', function(err, collection) {
        // Test return old document on change
        collection.insert({'a':2, 'b':2}, function(err, doc) {
  
          // Let's modify the document in place
          collection.findAndModify({'a':2}, [['a', 1]], {'$set':{'b':3}}, {safe:{w:200, wtimeout:1000}}, function(err, result) {
            test.equal(null, result);
            test.ok(err != null);
            p_client.close();
            test.done();
          })
        });
      });
    });
  },
  
  'Should correctly return new modified document' : function(test) {
    client.createCollection('Should_correctly_return_new_modified_document', function(err, collection) {
      var id = new ObjectID();
      var doc = {_id:id, a:1, b:1, c:{a:1, b:1}};
      
      collection.insert(doc, {safe:true}, function(err, result) {
        test.ok(err == null);
        
        // Find and modify returning the new object
        collection.findAndModify({_id:id}, [], {$set : {'c.c': 100}}, {new:true}, function(err, item) {
          test.equal(doc._id.toString(), item._id.toString());
          test.equal(doc.a, item.a);
          test.equal(doc.b, item.b);
          test.equal(doc.c.a, item.c.a);
          test.equal(doc.c.b, item.c.b);
          test.equal(100, item.c.c);          
          test.done();
        })
      });
    });
  },
  
  // Should correctly execute findAndModify that is breaking in prod
  shouldCorrectlyExecuteFindAndModify : function(test) {
    client.createCollection('shouldCorrectlyExecuteFindAndModify', function(err, collection) {
      var self = {_id : new ObjectID()}
      var _uuid = 'sddffdss'
      
      collection.findAndModify(
           {_id: self._id, 'plays.uuid': _uuid},
           [],
           {$set : {'plays.$.active': true}},
           {new: true, fields: {plays: 0, results: 0}, safe: true},
         function(err, contest) {
           test.done();           
         })  
    });    
  },
  
  'Should correctly return record with 64-bit id' : function(test) {
    client.createCollection('should_correctly_return_record_with_64bit_id', function(err, collection) {
      var _lowerId = new ObjectID();
      var _higherId = new ObjectID();
      var lowerId = new Long.fromString('133118461172916224', 10);
      var higherId = new Long.fromString('133118461172916225', 10);
  
      var lowerDoc = {_id:_lowerId, id: lowerId};
      var higherDoc = {_id:_higherId, id: higherId};
  
      collection.insert([lowerDoc, higherDoc], {safe:true}, function(err, result) {
        test.ok(err == null);
  
        // Select record with id of 133118461172916225 using $gt directive
        collection.find({id: {$gt:  lowerId}}, {}, function(err, cur) {
          test.ok(err == null);
  
          cur.toArray(function(err, arr) {
            test.ok(err == null);
            test.equal(arr.length, 1, 'Selecting record via $gt directive on 64-bit integer should return a record with higher Id')
            test.equal(arr[0].id.toString(), '133118461172916225', 'Returned Id should be equal to 133118461172916225')
            test.done()
          });
        });
      });
    });
  },  
  
  'Should Correctly find a Document using findOne excluding _id field' : function(test) {
    client.createCollection('Should_Correctly_find_a_Document_using_findOne_excluding__id_field', function(err, collection) {
      var doc = {_id : new ObjectID(), a:1, c:2}
      // insert doc
      collection.insert(doc, {safe:true}, function(err, result) {
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
            test.done();
          })
        })
      });
    });
  },
  
  'Should correctly execute find and findOne queries in the same way' : function(test) {
    client.createCollection('Should_correctly_execute_find_and_findOne_queries_in_the_same_way', function(err, collection) {      
      var doc = {_id : new ObjectID(), a:1, c:2, comments:[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]};
      // insert doc
      collection.insert(doc, {safe:true}, function(err, result) {
        
        collection.find({_id: doc._id}, {comments: {$slice: -5}}).toArray(function(err, docs) {
          test.equal(5, docs[0].comments.length)
  
          collection.findOne({_id: doc._id}, {comments: {$slice: -5}}, function(err, item) {
            test.equal(5, item.comments.length)
            test.done();
          });
        });
      });
    });
  },
  
  'Should correctly execute find and findOne queries with selector set to null' : function(test) {
    client.createCollection('Should_correctly_execute_find_and_findOne_queries_in_the_same_way', function(err, collection) {      
      var doc = {_id : new ObjectID(), a:1, c:2, comments:[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]};
      // insert doc
      collection.insert(doc, {safe:true}, function(err, result) {
        
        collection.find(null, {comments: {$slice: -5}}).toArray(function(err, docs) {
          test.equal(5, docs[0].comments.length)
  
          collection.findOne(null, {comments: {$slice: -5}}, function(err, item) {
            test.equal(5, item.comments.length)
            test.done();
          });
        });
      });
    });
  },
  
  shouldCorrectlyHandlerErrorForFindAndModifyWhenNoRecordExists : function(test) {
    client.createCollection('shouldCorrectlyHandlerErrorForFindAndModifyWhenNoRecordExists', function(err, collection) {
      collection.findAndModify({'a':1}, [], {'$set':{'b':3}}, {'new': true}, function(err, updated_doc) {
        test.equal(null, err);
        test.equal(null, updated_doc);
        test.done();
      });
    });
  },
  
  shouldCorrectlyExecuteFindAndModifyShouldGenerateCorrectBSON : function(test) {
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
    
    client.createCollection('shouldCorrectlyExecuteFindAndModify', function(err, collection) {
      collection.insert(wrapingObject, {safe:true}, function(err, doc) {
        test.equal(null, err);
    
        collection.findOne({_id:doc[0]._id, 'funds.remaining': {$gte: 3.0}, 'transactions.id': {$ne: transaction.transactionId}}, function(err, item) {
          test.ok(item != null)
          
          collection.findAndModify({_id:doc[0]._id, 'funds.remaining': {$gte: 3.0}, 'transactions.id': {$ne: transaction.transactionId}}, [], {$push: {transactions: transaction}}, {new: true, safe: true}, function(err, result) {
            test.done();
          });
        })        
      });
    });
  },
  
  shouldCorrectlyExecuteMultipleFindsInParallel : function(test) {
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize:10, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    p_client.open(function(err, p_client) {
      p_client.createCollection('tasks', function(err, collection) {
        var numberOfOperations = 0;
        
        // Test return old document on change
        collection.insert({'a':2, 'b':2}, {safe:true}, function(err, doc) {
          collection.find({"user_id":"4e9fc8d55883d90100000003","lc_status":{"$ne":"deleted"},"owner_rating":{"$exists":false}}, 
            {"skip":0,"limit":10,"sort":{"updated":-1}}, function(err, cursor) {
            cursor.count(function(err, count) {
              numberOfOperations = numberOfOperations + 1;
              if(numberOfOperations == 2) {
                test.done();
                p_client.close();
              }
            })  
          });
  
          collection.find({"user_id":"4e9fc8d55883d90100000003","lc_status":{"$ne":"deleted"},"owner_rating":{"$exists":false}}, 
            {"skip":0,"limit":10,"sort":{"updated":-1}}, function(err, cursor) {
            cursor.count(function(err, count) {
              numberOfOperations = numberOfOperations + 1;
              if(numberOfOperations == 2) {
                test.done();
                p_client.close();
              }
            })  
          });
        });
      });
    });
  },
  
  shouldCorrectlyReturnErrorFromMongodbOnFindAndModifyForcedError : function(test) {
    client.createCollection('shouldCorrectlyReturnErrorFromMongodbOnFindAndModifyForcedError', function(err, collection) {
      var q = { x: 1 };
      var set = { y:2, _id: new ObjectID() };
      var opts = { new: true, upsert: true };
      // Original doc
      var doc = {_id: new ObjectID(), x:1};
  
      // Insert original doc
      collection.insert(doc, {safe:true}, function(err, result) {
        collection.findAndModify(q, [], set, opts, function (err, res) {
          test.ok(err != null);
          test.done();
        });        
      });
    });
  },
  
  shouldCorrectlyExecuteFindAndModifyUnderConcurrentLoad : function(test) {
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize:10}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    var running = true;
  
    p_client.open(function(err, p_client) {
      // Create a collection
      p_client.collection("collection1", function(err, collection) {
        // Wait a bit and then execute something that will throw a duplicate error
        setTimeout(function() {          
          var id = new ObjectID();
          
          collection.insert({_id:id, a:1}, {safe:true}, function(err, result) {
            test.equal(null, err);
            
            collection.insert({_id:id, a:1}, {safe:true}, function(err, result) {
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
  },  
  
  shouldCorrectlyIterateOverCollection : function(test) {
    var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize:1}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    var numberOfSteps = 0;
  
    // Open db connection
    p_client.open(function(err, p_client) {
      // Create a collection
      p_client.createCollection('shouldCorrectlyIterateOverCollection', function(err, collection) {
        for(var i = 0; i < 1000; i++) {
          collection.insert({a:1, b:2, c:{d:3, f:'sfdsffffffffffffffffffffffffffffff'}});
        }      
        
        collection.find({}, {}, function(err,cursor) {
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
    });
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;

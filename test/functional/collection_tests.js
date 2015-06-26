"use strict";

/**
 * @ignore
 */
exports.shouldCorrectExecuteBasicCollectionMethods = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, client) {
      var collection = client.createCollection('test_collection_methods', function(err, collection) {
        // Verify that all the result are correct coming back (should contain the value ok)
        test.equal('test_collection_methods', collection.collectionName);
        // Let's check that the collection was created correctly
        db.listCollections().toArray(function(err, documents) {
          var found = false;
          documents.forEach(function(document) {
            if(document.name == "integration_tests_.test_collection_methods") found = true;
          });
          test.ok(true, found);

          // Rename the collection and check that it's gone
          db.renameCollection("test_collection_methods", "test_collection_methods2", function(err, reply) {
            test.equal(null, err);
            // Drop the collection and check that it's gone
            db.dropCollection("test_collection_methods2", function(err, result) {
              test.equal(true, result);
            });
          });

          db.createCollection('test_collection_methods3', function(err, collection) {
            // Verify that all the result are correct coming back (should contain the value ok)
            test.equal('test_collection_methods3', collection.collectionName);

            db.createCollection('test_collection_methods4', function(err, collection) {
              // Verify that all the result are correct coming back (should contain the value ok)
              test.equal('test_collection_methods4', collection.collectionName);

              // Rename the collection and with the dropTarget boolean, and check to make sure only onen exists.
              db.renameCollection("test_collection_methods4", "test_collection_methods3", {dropTarget:true}, function(err, reply) {
                test.equal(null, err);

                db.dropCollection("test_collection_methods3", function(err, result) {
                  test.equal(true, result);
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
exports.shouldAccessToCollections = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, client) {
      // Create two collections
      db.createCollection('test.spiderman', function(r) {
        db.createCollection('test.mario', function(r) {
          // Insert test documents (creates collections)
          db.collection('test.spiderman', function(err, spiderman_collection) {
            spiderman_collection.insert({foo:5}, configuration.writeConcernMax(), function(err, r) {
              db.collection('test.mario', function(err, mario_collection) {
                mario_collection.insert({bar:0}, configuration.writeConcernMax(), function(err, r) {
                  // Assert collections
                  db.collections(function(err, collections) {
                    var found_spiderman = false;
                    var found_mario = false;
                    var found_does_not_exist = false;

                    collections.forEach(function(collection) {
                      if(collection.collectionName == "test.spiderman") found_spiderman = true;
                      if(collection.collectionName == "test.mario") found_mario = true;
                      if(collection.collectionName == "does_not_exist") found_does_not_exist = true;
                    });

                    test.ok(found_spiderman);
                    test.ok(found_mario);
                    test.ok(!found_does_not_exist);
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
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrivelistCollections = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open(function(err, db) {
      db.createCollection('test_collection_names', function(err, r) {
        test.equal(null, err);

        db.listCollections().toArray(function(err, documents) {
          var found = false;
          var found2 = false;

          documents.forEach(function(document) {
            if(document.name == configuration.database + '.test_collection_names'
              ||  document.name == "test_collection_names") found = true;
          });

          test.ok(found);
          // Insert a document in an non-existing collection should create the collection
          var collection = db.collection('test_collection_names2');
          collection.insert({a:1}, configuration.writeConcernMax(), function(err, r) {
            test.equal(null, err);

            db.listCollections().toArray(function(err, documents) {
              documents.forEach(function(document) {
                if(document.name == configuration.database + '.test_collection_names2'
                  || document.name == 'test_collection_names2') found = true;
                if(document.name == configuration.database + '.test_collection_names'
                  || document.name == 'test_collection_names') found2 = true;
              });

              test.ok(found);
              test.ok(found2);

              // Let's close the db
              db.close();
              test.done();
            });
          })
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldEnsureStrictAccessCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('does-not-exist', {strict: true}, function(err, collection) {
        test.ok(err instanceof Error);
        test.equal("Collection does-not-exist does not exist. Currently in strict mode.", err.message);

        db.createCollection('test_strict_access_collection', function(err, collection) {
          db.collection('test_strict_access_collection', configuration.writeConcernMax(), function(err, collection) {
            test.equal(null, err);
            test.ok(collection.collectionName);
            // Let's close the db
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
exports.shouldPerformStrictCreateCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_strict_create_collection', function(err, collection) {
        test.equal(null, err);
        test.equal('test_strict_create_collection', collection.collectionName);

        // Creating an existing collection should fail
        db.createCollection('test_strict_create_collection', {strict: true}, function(err, collection) {
          test.ok(err instanceof Error);
          test.equal("Collection test_strict_create_collection already exists. Currently in strict mode.", err.message);

          // Switch out of strict mode and try to re-create collection
          db.createCollection('test_strict_create_collection', {strict: false}, function(err, collection) {
            test.equal(null, err);
            test.ok(collection.collectionName);

            // Let's close the db
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
exports.shouldFailToInsertDueToIllegalKeys = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_invalid_key_names', function(err, collection) {
        // Legal inserts
        collection.insert([{'hello':'world'}, {'hello':{'hello':'world'}}], configuration.writeConcernMax(), function(err, r) {
          // Illegal insert for key
          collection.insert({'$hello':'world'}, configuration.writeConcernMax(), function(err, doc) {
            test.ok(err instanceof Error);
            test.equal("key $hello must not start with '$'", err.message);

            collection.insert({'hello':{'$hello':'world'}}, configuration.writeConcernMax(), function(err, doc) {
              test.ok(err instanceof Error);
              test.equal("key $hello must not start with '$'", err.message);

              collection.insert({'he$llo':'world'}, configuration.writeConcernMax(), function(err, docs) {
                test.equal(null, err);

                collection.insert({'hello':{'hell$o':'world'}}, configuration.writeConcernMax(), function(err, docs) {
                  test.ok(err == null);

                  collection.insert({'.hello':'world'}, configuration.writeConcernMax(), function(err, doc) {
                    test.ok(err instanceof Error);
                    test.equal("key .hello must not contain '.'", err.message);

                    collection.insert({'hello':{'.hello':'world'}}, configuration.writeConcernMax(), function(err, doc) {
                      test.ok(err instanceof Error);
                      test.equal("key .hello must not contain '.'", err.message);

                      collection.insert({'hello.':'world'}, configuration.writeConcernMax(), function(err, doc) {
                        test.ok(err instanceof Error);
                        test.equal("key hello. must not contain '.'", err.message);

                        collection.insert({'hello':{'hello.':'world'}}, configuration.writeConcernMax(), function(err, doc) {
                          test.ok(err instanceof Error);
                          test.equal("key hello. must not contain '.'", err.message);
                          // Let's close the db
                          db.close();
                          test.done();
                        });
                      });
                    });
                  });
                })
              })
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
exports.shouldFailDueToIllegallistCollections = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection(5, function(err, collection) {
        test.equal("collection name must be a String", err.message);
      });

      db.collection("", function(err, collection) {
        test.equal("collection names cannot be empty", err.message);
      });

      db.collection("te$t", function(err, collection) {
        test.equal("collection names must not contain '$'", err.message);
      });

      db.collection(".test", function(err, collection) {
        test.equal("collection names must not start or end with '.'", err.message);
      });

      db.collection("test.", function(err, collection) {
        test.equal("collection names must not start or end with '.'", err.message);
      });

      db.collection("test..t", function(err, collection) {
        test.equal("collection names cannot be empty", err.message);
        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCountOnNonExistingCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('test_multiple_insert_2', function(err, collection) {
        collection.count(function(err, count) {
          test.equal(0, count);
          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteSave = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_save', function(err, collection) {
        var doc = {'hello':'world'};
        collection.save(doc, configuration.writeConcernMax(), function(err, r) {
          test.ok(r.ops[0]._id != null);

          collection.count(function(err, count) {
            test.equal(1, count);

            collection.save(r.ops[0], configuration.writeConcernMax(), function(err, doc2) {

              collection.count(function(err, count) {
                test.equal(1, count);

                collection.findOne(function(err, doc3) {
                  test.equal('world', doc3.hello);

                  doc3.hello = 'mike';

                  collection.save(doc3, configuration.writeConcernMax(), function(err, doc4) {
                    collection.count(function(err, count) {
                      test.equal(1, count);

                      collection.findOne(function(err, doc5) {
                        test.equal('mike', doc5.hello);

                        // Save another document
                        collection.save({hello:'world'}, configuration.writeConcernMax(), function(err, doc) {
                          collection.count(function(err, count) {
                            test.equal(2, count);
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
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentWithLongValue = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_save_long', function(err, collection) {
        collection.insert({'x':Long.fromNumber(9223372036854775807)}, configuration.writeConcernMax(), function(err, r) {
          collection.findOne(function(err, doc) {
            test.ok(Long.fromNumber(9223372036854775807).equals(doc.x));
            // Let's close the db
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
exports.shouldSaveObjectThatHasIdButDoesNotExistInCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection', function(err, collection) {
        var a = {'_id':'1', 'hello':'world'};
        collection.save(a, configuration.writeConcernMax(), function(err, docs) {
          collection.count(function(err, count) {
            test.equal(1, count);

            collection.findOne(function(err, doc) {
              test.equal('world', doc.hello);

              doc.hello = 'mike';
              collection.save(doc, configuration.writeConcernMax(), function(err, doc) {
                collection.findOne(function(err, doc) {
                  collection.count(function(err, count) {
                    test.equal(1, count);

                    test.equal('mike', doc.hello);
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
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyUpdateWithNoDocs = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_should_correctly_do_update_with_no_docs', function(err, collection) {
        var id = new ObjectID(null)
        var doc = {_id:id, a:1};

        collection.update({"_id":id}, doc, configuration.writeConcernMax(), function(err, r) {
          test.equal(null, err);
          test.equal(0, r.result.n);

          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteInsertUpdateDeleteSafeMode = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_should_execute_insert_update_delete_safe_mode', function(err, collection) {
        test.equal('test_should_execute_insert_update_delete_safe_mode', collection.collectionName);

        collection.insert({i:1}, configuration.writeConcernMax(), function(err, r) {
          test.equal(1, r.ops.length);
          test.ok(r.ops[0]._id.toHexString().length == 24);

          // Update the record
          collection.update({i:1}, {"$set":{i:2}}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);
            test.equal(1, r.result.n);

            // Remove safely
            collection.remove({}, configuration.writeConcernMax(), function(err, result) {
              test.equal(null, err);

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
exports.shouldPerformMultipleSaves = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection("multiple_save_test", function(err, collection) {
        var doc = {
          name: 'amit',
          text: 'some text'
        };

        //insert new user
        collection.save(doc, configuration.writeConcernMax(), function(err, r) {
          test.equal(null, err);

          collection.find({}, {name: 1}).limit(1).toArray(function(err, users){
            var user = users[0]

            if(err) {
              throw new Error(err)
            } else if(user) {
              user.pants = 'worn'

              collection.save(user, configuration.writeConcernMax(), function(err, result){
                test.equal(null, err);
                test.equal(1, result.result.n);
                db.close();
                test.done();
              })
            }
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentWithNestedArray = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection("save_error_on_save_test", function(err, collection) {
        // Create unique index for username
        collection.createIndex([['username', 1]], configuration.writeConcernMax(), function(err, result) {
          var doc = {
            email: 'email@email.com',
            encrypted_password: 'password',
            friends:
              [ '4db96b973d01205364000006',
                '4db94a1948a683a176000001',
                '4dc77b24c5ba38be14000002' ],
            location: [ 72.4930088, 23.0431957 ],
            name: 'Amit Kumar',
            password_salt: 'salty',
            profile_fields: [],
            username: 'amit' };
          //insert new user
          collection.save(doc, configuration.writeConcernMax(), function(err, doc) {
              test.equal(null, err);

              collection.find({}).limit(1).toArray(function(err, users) {
                test.equal(null, err);
                var user = users[0]
                user.friends.splice(1,1)

                collection.save(user, function(err, doc) {
                  test.equal(null, err);

                  // Update again
                  collection.update({_id:new ObjectID(user._id.toString())}, {friends:user.friends}, {upsert:true, w: 1}, function(err, result) {
                    test.equal(null, err);
                    test.equal(1, result.result.n);

                    db.close();
                    test.done();
                  });
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
exports.shouldPeformCollectionRemoveWithNoCallback = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection("remove_with_no_callback_bug_test", function(err, collection) {
        collection.save({a:1}, configuration.writeConcernMax(), function(){
          collection.save({b:1}, configuration.writeConcernMax(), function(){
            collection.save({c:1}, configuration.writeConcernMax(), function(){
               collection.remove({a:1}, configuration.writeConcernMax(), function(err, r) {
                 // Let's perform a count
                 collection.count(function(err, count) {
                   test.equal(null, err);
                   test.equal(2, count);
                   db.close();
                   test.done();
                 });
               })
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
exports.shouldCorrectlyCreateTTLCollectionWithIndexUsingEnsureIndex = {
  metadata: { requires: { mongodb: ">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyCreateTTLCollectionWithIndexUsingEnsureIndex', function(err, collection) {
        collection.ensureIndex({createdAt:1}, {expireAfterSeconds:1, w: 1}, function(err, result) {
          test.equal(null, err);

          // Insert a document with a date
          collection.insert({a:1, createdAt:new Date()}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            collection.indexInformation({full:true}, function(err, indexes) {
              test.equal(null, err);

              for(var i = 0; i < indexes.length; i++) {
                if(indexes[i].name == "createdAt_1") {
                  test.equal(1, indexes[i].expireAfterSeconds);
                  break;
                }
              }

              db.close();
              test.done();
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
exports.shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex = {
  metadata: { requires: { mongodb: ">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex', {}, function(err, collection) {
        collection.createIndex({createdAt:1}, {expireAfterSeconds:1, w: 1}, function(err, result) {
          test.equal(null, err);

          // Insert a document with a date
          collection.insert({a:1, createdAt:new Date()}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            collection.indexInformation({full:true}, function(err, indexes) {
              test.equal(null, err);

              for(var i = 0; i < indexes.length; i++) {
                if(indexes[i].name == "createdAt_1") {
                  test.equal(1, indexes[i].expireAfterSeconds);
                  break;
                }
              }

              db.close();
              test.done();
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
exports.shouldCorrectlyReadBackDocumentWithNull = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyReadBackDocumentWithNull', {}, function(err, collection) {
        // Insert a document with a date
        collection.insert({test:null}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            collection.findOne(function(err, item) {
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
exports.shouldThrowErrorDueToIllegalUpdate = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldThrowErrorDueToIllegalUpdate', {}, function(err, coll) {
        try {
          coll.update({}, null, function (err, res) {});
        } catch (err) {
          test.equal("document must be a valid JavaScript object", err.message)
        }

        try {
          coll.update(null, null, function (err, res) {});
        } catch (err) {
          test.equal("selector must be a valid JavaScript object", err.message)
        }

        db.close();
        test.done()
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandle0asIdForSave = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHandle0asIdForSave').save({_id:0}, function(err, r) {
        test.equal(null, err);

        db.collection('shouldCorrectlyHandle0asIdForSave').save({_id:0}, function(err, r) {
          test.equal(null, err);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute update with . field in selector'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('executeUpdateWithElemMatch').update({'item.i': 1}, {$set: {a:1}}, function(err, result, full) {
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute update with elemMatch field in selector'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('executeUpdateWithElemMatch').update({item: {$elemMatch: {name: 'my_name'}}}, {$set: {a:1}}, function(err, result, full) {
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should fail due to exiting collection'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldFailDueToExistingCollection', {strict: true}, function(err, coll) {
        test.equal(null, err);
        test.ok(coll != null);

        db.createCollection('shouldFailDueToExistingCollection', {strict: true}, function(err, coll) {
          test.ok(err != null);

          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldFilterCorrectlyDuringList = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // The collection happens to contain the database name
    var testCollection = 'integration_tests_collection_123';
    db.open(function(err, client) {
      // Create a collection
      db.createCollection(testCollection, function(err, r) {
        test.equal(null, err);

        db.listCollections({name: testCollection}).toArray(function(err, documents) {
          test.equal(null, err);
          test.equal(documents.length, 1);
          var found = false;
          documents.forEach(function(document) {
            if(document.name == testCollection) found = true;
          });
          test.ok(found);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldFilterCorrectlyWithIndexDuringList = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    var testCollection = 'collection_124';
    db.open(function(err, client) {
      // Create a collection
      db.createCollection(testCollection, function(err, r) {
        test.equal(null, err);

        // Index name happens to be the same as collection name
        db.createIndex(testCollection, 'collection_124', {w:1}, function(err, indexName) {
          test.equal(null, err);
          test.equal("collection_124_1", indexName);

          db.listCollections().toArray(function(err, documents) {
            test.equal(null, err);
            test.ok(documents.length > 1);
            var found = false;

            documents.forEach(function(document) {
              if(document.name == testCollection) found = true;
            });

            test.ok(found);
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
exports['Should correctly list multipleCollections'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, client) {
      test.equal(null, err);

      var emptyDb = db.db('listCollectionsDb');
      emptyDb.createCollection('test1', function(err) {
        test.equal(null, err);

        emptyDb.createCollection('test2', function(err) {
          test.equal(null, err);

          emptyDb.createCollection('test3', function(err) {
            test.equal(null, err);

            emptyDb.listCollections().toArray(function(err, collections) {
              test.equal(null, err);
              // By name
              var names = {};

              for(var i = 0; i < collections.length; i++) {
                names[collections[i].name] = collections[i];
              }

              test.ok(names['test1'] != null);
              test.ok(names['test2'] != null);
              test.ok(names['test3'] != null);

              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

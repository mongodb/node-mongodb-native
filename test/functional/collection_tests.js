'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Collection', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('should correctly execute basic collection methods', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });
      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_collection_methods', function(err, collection) {
          // Verify that all the result are correct coming back (should contain the value ok)
          test.equal('test_collection_methods', collection.collectionName);
          // Let's check that the collection was created correctly
          db.listCollections().toArray(function(err, documents) {
            var found = false;
            documents.forEach(function(document) {
              if (document.name == 'integration_tests_.test_collection_methods') found = true;
            });
            test.ok(true, found);

            // Rename the collection and check that it's gone
            db.renameCollection('test_collection_methods', 'test_collection_methods2', function(
              err
            ) {
              test.equal(null, err);
              // Drop the collection and check that it's gone
              db.dropCollection('test_collection_methods2', function(err, result) {
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
                db.renameCollection(
                  'test_collection_methods4',
                  'test_collection_methods3',
                  { dropTarget: true },
                  function(err) {
                    test.equal(null, err);

                    db.dropCollection('test_collection_methods3', function(err, result) {
                      test.equal(true, result);
                      client.close();
                      done();
                    });
                  }
                );
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly list back collection names containing .', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db1 = client.db('test');
        db1.createCollection('test.game', function(err, collection) {
          // Verify that all the result are correct coming back (should contain the value ok)
          test.equal('test.game', collection.collectionName);
          // Let's check that the collection was created correctly
          db1.listCollections().toArray(function(err, documents) {
            test.equal(null, err);
            var found = false;
            documents.forEach(function(x) {
              if (x.name == 'test.game') found = true;
            });

            test.ok(found);
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should access to collections', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        // Create two collections
        db.createCollection('test.spiderman', function() {
          db.createCollection('test.mario', function() {
            // Insert test documents (creates collections)
            db.collection('test.spiderman', function(err, spiderman_collection) {
              spiderman_collection.insert(
                { foo: 5 },
                self.configuration.writeConcernMax(),
                function(err) {
                  test.equal(null, err);
                  db.collection('test.mario', function(err, mario_collection) {
                    mario_collection.insert(
                      { bar: 0 },
                      self.configuration.writeConcernMax(),
                      function(err) {
                        test.equal(null, err);
                        // Assert collections
                        db.collections(function(err, collections) {
                          var found_spiderman = false;
                          var found_mario = false;
                          var found_does_not_exist = false;

                          collections.forEach(function(collection) {
                            if (collection.collectionName == 'test.spiderman')
                              found_spiderman = true;
                            if (collection.collectionName == 'test.mario') found_mario = true;
                            if (collection.collectionName == 'does_not_exist')
                              found_does_not_exist = true;
                          });

                          test.ok(found_spiderman);
                          test.ok(found_mario);
                          test.ok(!found_does_not_exist);
                          client.close();
                          done();
                        });
                      }
                    );
                  });
                }
              );
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly retrieve listCollections', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_collection_names', function(err) {
          test.equal(null, err);

          db.listCollections().toArray(function(err, documents) {
            var found = false;
            var found2 = false;

            documents.forEach(function(document) {
              if (
                document.name == self.configuration.db + '.test_collection_names' ||
                document.name == 'test_collection_names'
              )
                found = true;
            });

            test.ok(found);
            // Insert a document in an non-existing collection should create the collection
            var collection = db.collection('test_collection_names2');
            collection.insert({ a: 1 }, self.configuration.writeConcernMax(), function(err) {
              test.equal(null, err);

              db.listCollections().toArray(function(err, documents) {
                documents.forEach(function(document) {
                  if (
                    document.name == self.configuration.db + '.test_collection_names2' ||
                    document.name == 'test_collection_names2'
                  )
                    found = true;
                  if (
                    document.name == self.configuration.db + '.test_collection_names' ||
                    document.name == 'test_collection_names'
                  )
                    found2 = true;
                });

                test.ok(found);
                test.ok(found2);

                // Let's close the db
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should ensure strict access collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.collection('does-not-exist', { strict: true }, function(err) {
          test.ok(err instanceof Error);
          test.equal(
            'Collection does-not-exist does not exist. Currently in strict mode.',
            err.message
          );

          db.createCollection('test_strict_access_collection', function(err) {
            test.equal(null, err);
            db.collection(
              'test_strict_access_collection',
              self.configuration.writeConcernMax(),
              function(err, collection) {
                test.equal(null, err);
                test.ok(collection.collectionName);
                // Let's close the db
                client.close();
                done();
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should perform strict create collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_strict_create_collection', function(err, collection) {
          test.equal(null, err);
          test.equal('test_strict_create_collection', collection.collectionName);

          // Creating an existing collection should fail
          db.createCollection('test_strict_create_collection', { strict: true }, function(err) {
            test.ok(err instanceof Error);
            test.equal(
              'Collection test_strict_create_collection already exists. Currently in strict mode.',
              err.message
            );

            // Switch out of strict mode and try to re-create collection
            db.createCollection('test_strict_create_collection', { strict: false }, function(
              err,
              collection
            ) {
              test.equal(null, err);
              test.ok(collection.collectionName);

              // Let's close the db
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should fail to insert due to illegal keys', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_invalid_key_names', function(err, collection) {
          // Legal inserts
          collection.insert(
            [{ hello: 'world' }, { hello: { hello: 'world' } }],
            self.configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              // Illegal insert for key
              collection.insert({ $hello: 'world' }, self.configuration.writeConcernMax(), function(
                err
              ) {
                test.ok(err instanceof Error);
                test.equal("key $hello must not start with '$'", err.message);

                collection.insert(
                  { hello: { $hello: 'world' } },
                  self.configuration.writeConcernMax(),
                  function(err) {
                    test.ok(err instanceof Error);
                    test.equal("key $hello must not start with '$'", err.message);

                    collection.insert(
                      { he$llo: 'world' },
                      self.configuration.writeConcernMax(),
                      function(err) {
                        test.equal(null, err);

                        collection.insert(
                          { hello: { hell$o: 'world' } },
                          self.configuration.writeConcernMax(),
                          function(err) {
                            test.ok(err == null);

                            collection.insert(
                              { '.hello': 'world' },
                              self.configuration.writeConcernMax(),
                              function(err) {
                                test.ok(err instanceof Error);
                                test.equal("key .hello must not contain '.'", err.message);

                                collection.insert(
                                  { hello: { '.hello': 'world' } },
                                  self.configuration.writeConcernMax(),
                                  function(err) {
                                    test.ok(err instanceof Error);
                                    test.equal("key .hello must not contain '.'", err.message);

                                    collection.insert(
                                      { 'hello.': 'world' },
                                      self.configuration.writeConcernMax(),
                                      function(err) {
                                        test.ok(err instanceof Error);
                                        test.equal("key hello. must not contain '.'", err.message);

                                        collection.insert(
                                          { hello: { 'hello.': 'world' } },
                                          self.configuration.writeConcernMax(),
                                          function(err) {
                                            test.ok(err instanceof Error);
                                            test.equal(
                                              "key hello. must not contain '.'",
                                              err.message
                                            );
                                            // Let's close the db
                                            client.close();
                                            done();
                                          }
                                        );
                                      }
                                    );
                                  }
                                );
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should fail due to illegal listCollections', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.collection(5, function(err) {
          test.equal('collection name must be a String', err.message);
        });

        db.collection('', function(err) {
          test.equal('collection names cannot be empty', err.message);
        });

        db.collection('te$t', function(err) {
          test.equal("collection names must not contain '$'", err.message);
        });

        db.collection('.test', function(err) {
          test.equal("collection names must not start or end with '.'", err.message);
        });

        db.collection('test.', function(err) {
          test.equal("collection names must not start or end with '.'", err.message);
        });

        db.collection('test..t', function(err) {
          test.equal('collection names cannot be empty', err.message);
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should crrectly count on non-existent collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.collection('test_multiple_insert_2', function(err, collection) {
          collection.count(function(err, count) {
            test.equal(0, count);
            // Let's close the db
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly execute save', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_save', function(err, collection) {
          var doc = { hello: 'world' };
          collection.save(doc, self.configuration.writeConcernMax(), function(err, r) {
            test.ok(r.ops[0]._id != null);

            collection.count(function(err, count) {
              test.equal(1, count);

              collection.save(r.ops[0], self.configuration.writeConcernMax(), function(err) {
                test.equal(null, err);
                collection.count(function(err, count) {
                  test.equal(1, count);

                  collection.findOne(function(err, doc3) {
                    test.equal('world', doc3.hello);

                    doc3.hello = 'mike';

                    collection.save(doc3, self.configuration.writeConcernMax(), function(err) {
                      test.equal(null, err);
                      collection.count(function(err, count) {
                        test.equal(1, count);

                        collection.findOne(function(err, doc5) {
                          test.equal('mike', doc5.hello);

                          // Save another document
                          collection.save(
                            { hello: 'world' },
                            self.configuration.writeConcernMax(),
                            function(err) {
                              test.equal(null, err);
                              collection.count(function(err, count) {
                                test.equal(2, count);
                                // Let's close the db
                                client.close();
                                done();
                              });
                            }
                          );
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
  });

  /**
   * @ignore
   */
  it('should correctly save document with Long value', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var Long = self.configuration.require.Long;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_save_long', function(err, collection) {
          collection.insert(
            { x: Long.fromNumber(9223372036854775807) },
            self.configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);
              collection.findOne(function(err, doc) {
                test.equal(null, err);
                test.ok(Long.fromNumber(9223372036854775807).equals(doc.x));
                // Let's close the db
                client.close();
                done();
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should save object that has id but does not exist in collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection(
          'test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection',
          function(err, collection) {
            var a = { _id: '1', hello: 'world' };
            collection.save(a, self.configuration.writeConcernMax(), function(err) {
              test.equal(null, err);
              collection.count(function(err, count) {
                test.equal(1, count);

                collection.findOne(function(err, doc) {
                  test.equal('world', doc.hello);

                  doc.hello = 'mike';
                  collection.save(doc, self.configuration.writeConcernMax(), function(err) {
                    test.equal(null, err);
                    collection.findOne(function(err, doc) {
                      collection.count(function(err, count) {
                        test.equal(1, count);

                        test.equal('mike', doc.hello);
                        // Let's close the db
                        client.close();
                        done();
                      });
                    });
                  });
                });
              });
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly update with no docs', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var ObjectID = self.configuration.require.ObjectID;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_should_correctly_do_update_with_no_docs', function(
          err,
          collection
        ) {
          var id = new ObjectID(null);
          var doc = { _id: id, a: 1 };

          collection.update({ _id: id }, doc, self.configuration.writeConcernMax(), function(
            err,
            r
          ) {
            test.equal(null, err);
            test.equal(0, r.result.n);

            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly execute insert update delete safe mode', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('test_should_execute_insert_update_delete_safe_mode', function(
          err,
          collection
        ) {
          test.equal(
            'test_should_execute_insert_update_delete_safe_mode',
            collection.collectionName
          );

          collection.insert({ i: 1 }, self.configuration.writeConcernMax(), function(err, r) {
            test.equal(1, r.ops.length);
            test.ok(r.ops[0]._id.toHexString().length == 24);

            // Update the record
            collection.update(
              { i: 1 },
              { $set: { i: 2 } },
              self.configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);
                test.equal(1, r.result.n);

                // Remove safely
                collection.remove({}, self.configuration.writeConcernMax(), function(err) {
                  test.equal(null, err);

                  client.close();
                  done();
                });
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should perform multiple saves', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('multiple_save_test', function(err, collection) {
          var doc = {
            name: 'amit',
            text: 'some text'
          };

          //insert new user
          collection.save(doc, self.configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection
              .find({}, { name: 1 })
              .limit(1)
              .toArray(function(err, users) {
                var user = users[0];

                if (err) {
                  throw new Error(err);
                } else if (user) {
                  user.pants = 'worn';

                  collection.save(user, self.configuration.writeConcernMax(), function(
                    err,
                    result
                  ) {
                    test.equal(null, err);
                    test.equal(1, result.result.n);
                    client.close();
                    done();
                  });
                }
              });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly save document with nested array', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var ObjectID = self.configuration.require.ObjectID;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('save_error_on_save_test', function(err, collection) {
          // Create unique index for username
          collection.createIndex([['username', 1]], self.configuration.writeConcernMax(), function(
            err
          ) {
            test.equal(null, err);
            var doc = {
              email: 'email@email.com',
              encrypted_password: 'password',
              friends: [
                '4db96b973d01205364000006',
                '4db94a1948a683a176000001',
                '4dc77b24c5ba38be14000002'
              ],
              location: [72.4930088, 23.0431957],
              name: 'Amit Kumar',
              password_salt: 'salty',
              profile_fields: [],
              username: 'amit'
            };
            //insert new user
            collection.save(doc, self.configuration.writeConcernMax(), function(err) {
              test.equal(null, err);

              collection
                .find({})
                .limit(1)
                .toArray(function(err, users) {
                  test.equal(null, err);
                  var user = users[0];
                  user.friends.splice(1, 1);

                  collection.save(user, function(err) {
                    test.equal(null, err);

                    // Update again
                    collection.update(
                      { _id: new ObjectID(user._id.toString()) },
                      { friends: user.friends },
                      { upsert: true, w: 1 },
                      function(err, result) {
                        test.equal(null, err);
                        test.equal(1, result.result.n);

                        client.close();
                        done();
                      }
                    );
                  });
                });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should perform collection remove with no callback', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.collection('remove_with_no_callback_bug_test', function(err, collection) {
          test.equal(null, err);
          collection.save({ a: 1 }, self.configuration.writeConcernMax(), function(err) {
            test.equal(null, err);
            collection.save({ b: 1 }, self.configuration.writeConcernMax(), function(err) {
              test.equal(null, err);
              collection.save({ c: 1 }, self.configuration.writeConcernMax(), function(err) {
                test.equal(null, err);
                collection.remove({ a: 1 }, self.configuration.writeConcernMax(), function(err) {
                  test.equal(null, err);
                  // Let's perform a count
                  collection.count(function(err, count) {
                    test.equal(null, err);
                    test.equal(2, count);
                    client.close();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly create TTL collection with index using ensureIndex', {
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('shouldCorrectlyCreateTTLCollectionWithIndexUsingEnsureIndex', function(
          err,
          collection
        ) {
          collection.ensureIndex({ createdAt: 1 }, { expireAfterSeconds: 1, w: 1 }, function(err) {
            test.equal(null, err);

            // Insert a document with a date
            collection.insert(
              { a: 1, createdAt: new Date() },
              self.configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);

                collection.indexInformation({ full: true }, function(err, indexes) {
                  test.equal(null, err);

                  for (var i = 0; i < indexes.length; i++) {
                    if (indexes[i].name == 'createdAt_1') {
                      test.equal(1, indexes[i].expireAfterSeconds);
                      break;
                    }
                  }

                  client.close();
                  done();
                });
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly create TTL collection with index using createIndex', {
    metadata: {
      requires: {
        mongodb: '>2.1.0',
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex', {}, function(
          err,
          collection
        ) {
          collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 1, w: 1 }, function(err) {
            test.equal(null, err);

            // Insert a document with a date
            collection.insert(
              { a: 1, createdAt: new Date() },
              self.configuration.writeConcernMax(),
              function(err) {
                test.equal(null, err);

                collection.indexInformation({ full: true }, function(err, indexes) {
                  test.equal(null, err);

                  for (var i = 0; i < indexes.length; i++) {
                    if (indexes[i].name == 'createdAt_1') {
                      test.equal(1, indexes[i].expireAfterSeconds);
                      break;
                    }
                  }

                  client.close();
                  done();
                });
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly read back document with null', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('shouldCorrectlyReadBackDocumentWithNull', {}, function(
          err,
          collection
        ) {
          // Insert a document with a date
          collection.insert({ test: null }, self.configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            collection.findOne(function(err) {
              test.equal(null, err);

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should throw error due to illegal update', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('shouldThrowErrorDueToIllegalUpdate', {}, function(err, coll) {
          try {
            coll.update({}, null, function() {});
          } catch (err) {
            test.equal('document must be a valid JavaScript object', err.message);
          }

          try {
            coll.update(null, null, function() {});
          } catch (err) {
            test.equal('selector must be a valid JavaScript object', err.message);
          }

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly handle 0 as id for save', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.collection('shouldCorrectlyHandle0asIdForSave').save({ _id: 0 }, function(err) {
          test.equal(null, err);

          db.collection('shouldCorrectlyHandle0asIdForSave').save({ _id: 0 }, function(err) {
            test.equal(null, err);
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly execute update with . field in selector', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db
          .collection('executeUpdateWithElemMatch')
          .update({ 'item.i': 1 }, { $set: { a: 1 } }, function(err) {
            test.equal(null, err);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly execute update with elemMatch field in selector', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db
          .collection('executeUpdateWithElemMatch')
          .update({ item: { $elemMatch: { name: 'my_name' } } }, { $set: { a: 1 } }, function(err) {
            test.equal(null, err);

            client.close();
            done();
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should fail due to exiting collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        db.createCollection('shouldFailDueToExistingCollection', { strict: true }, function(
          err,
          coll
        ) {
          test.equal(null, err);
          test.ok(coll != null);

          db.createCollection('shouldFailDueToExistingCollection', { strict: true }, function(err) {
            test.ok(err != null);

            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should filter correctly during list', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var testCollection = 'integration_tests_collection_123'; // The collection happens to contain the database name
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        // Create a collection
        db.createCollection(testCollection, function(err) {
          test.equal(null, err);

          db.listCollections({ name: testCollection }).toArray(function(err, documents) {
            test.equal(null, err);
            test.equal(documents.length, 1);
            var found = false;
            documents.forEach(function(document) {
              if (document.name == testCollection) found = true;
            });
            test.ok(found);
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should filter correctly with index during list', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var testCollection = 'collection_124';
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);

        // Create a collection
        db.createCollection(testCollection, function(err) {
          test.equal(null, err);

          // Index name happens to be the same as collection name
          db.createIndex(testCollection, 'collection_124', { w: 1 }, function(err, indexName) {
            test.equal(null, err);
            test.equal('collection_124_1', indexName);

            db.listCollections().toArray(function(err, documents) {
              test.equal(null, err);
              test.ok(documents.length > 1);
              var found = false;

              documents.forEach(function(document) {
                if (document.name == testCollection) found = true;
              });

              test.ok(found);
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly list multipleCollections', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        test.equal(null, err);

        var emptyDb = client.db('listCollectionsDb');
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

                for (var i = 0; i < collections.length; i++) {
                  names[collections[i].name] = collections[i];
                }

                test.ok(names['test1'] != null);
                test.ok(names['test2'] != null);
                test.ok(names['test3'] != null);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly list multipleCollections', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        test.equal(null, err);

        var emptyDb = client.db('listCollectionsDb');
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

                for (var i = 0; i < collections.length; i++) {
                  names[collections[i].name] = collections[i];
                }

                test.ok(names['test1'] != null);
                test.ok(names['test2'] != null);
                test.ok(names['test3'] != null);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly handle namespace when using collections method', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        test.equal(null, err);

        var emptyDb = client.db('listCollectionsDb2');
        emptyDb.createCollection('test1', function(err) {
          test.equal(null, err);

          emptyDb.createCollection('test.test', function(err) {
            test.equal(null, err);

            emptyDb.createCollection('test3', function(err) {
              test.equal(null, err);

              emptyDb.collections(function(err, collections) {
                collections = collections.map(function(collection) {
                  return {
                    collectionName: collection.collectionName,
                    namespace: collection.namespace
                  };
                });

                var foundCollection = false;
                collections.forEach(function(x) {
                  if (
                    x.namespace == 'listCollectionsDb2.test.test' &&
                    x.collectionName == 'test.test'
                  ) {
                    foundCollection = true;
                  }
                });

                test.ok(foundCollection);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });
});

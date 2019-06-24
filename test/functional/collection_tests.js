'use strict';
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
const mock = require('mongodb-mock-server');
chai.use(sinonChai);

describe('Collection', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  describe('', function() {
    let client;
    beforeEach(function() {
      client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });
    });
    afterEach(function() {
      return client.close();
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('test_collection_methods', (err, collection) => {
            // Verify that all the result are correct coming back (should contain the value ok)
            expect('test_collection_methods').to.equal(collection.collectionName);
            // Let's check that the collection was created correctly
            db.listCollections().toArray((err, documents) => {
              let found = false;
              documents.forEach(document => {
                if (document.name === 'integration_tests_.test_collection_methods') found = true;
              });

              // Rename the collection and check that it's gone
              db.renameCollection('test_collection_methods', 'test_collection_methods2', err => {
                expect(err).to.not.exist;
                // Drop the collection and check that it's gone
                db.dropCollection('test_collection_methods2', (err, result) => {
                  expect(true).to.equal(result);
                });
              });

              db.createCollection('test_collection_methods3', (err, collection) => {
                // Verify that all the result are correct coming back (should contain the value ok)
                expect('test_collection_methods3').to.equal(collection.collectionName);

                db.createCollection('test_collection_methods4', (err, collection) => {
                  // Verify that all the result are correct coming back (should contain the value ok)
                  expect('test_collection_methods4').to.equal(collection.collectionName);

                  // Rename the collection and with the dropTarget boolean, and check to make sure only onen exists.
                  db.renameCollection(
                    'test_collection_methods4',
                    'test_collection_methods3',
                    { dropTarget: true },
                    err => {
                      expect(err).to.not.exist;

                      db.dropCollection('test_collection_methods3', (err, result) => {
                        expect(true).to.equal(result);
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db1 = client.db('test');
          db1.createCollection('test.game', (err, collection) => {
            // Verify that all the result are correct coming back (should contain the value ok)
            expect('test.game').to.equal(collection.collectionName);
            // Let's check that the collection was created correctly
            db1.listCollections().toArray((err, documents) => {
              expect(err).to.not.exist;
              let found = false;
              documents.forEach(x => {
                if (x.name === 'test.game') found = true;
              });

              expect(found).to.be.true;
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          // Create two collections
          db.createCollection('test.spiderman', () => {
            db.createCollection('test.mario', () => {
              // Insert test documents (creates collections)
              db.collection('test.spiderman', (err, spiderman_collection) => {
                spiderman_collection.insert(
                  { foo: 5 },
                  this.configuration.writeConcernMax(),
                  err => {
                    expect(err).to.not.exist;
                    db.collection('test.mario', (err, mario_collection) => {
                      mario_collection.insert(
                        { bar: 0 },
                        this.configuration.writeConcernMax(),
                        err => {
                          expect(err).to.not.exist;
                          // Assert collections
                          db.collections((err, collections) => {
                            let found_spiderman = false;
                            let found_mario = false;
                            let found_does_not_exist = false;

                            collections.forEach(collection => {
                              if (collection.collectionName === 'test.spiderman')
                                found_spiderman = true;
                              if (collection.collectionName === 'test.mario') found_mario = true;
                              if (collection.collectionName === 'does_not_exist')
                                found_does_not_exist = true;
                            });

                            expect(found_spiderman).to.be.true;
                            expect(found_mario).to.be.true;
                            expect(found_does_not_exist).to.be.false;
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('test_collection_names', err => {
            expect(err).to.not.exist;

            db.listCollections().toArray((err, documents) => {
              let found = false;
              let found2 = false;

              documents.forEach(document => {
                if (
                  document.name === this.configuration.db + '.test_collection_names' ||
                  document.name === 'test_collection_names'
                )
                  found = true;
              });

              expect(found).to.be.true;
              // Insert a document in an non-existing collection should create the collection
              const collection = db.collection('test_collection_names2');
              collection.insert({ a: 1 }, this.configuration.writeConcernMax(), err => {
                expect(err).to.not.exist;

                db.listCollections().toArray((err, documents) => {
                  documents.forEach(document => {
                    if (
                      document.name === this.configuration.db + '.test_collection_names2' ||
                      document.name === 'test_collection_names2'
                    )
                      found = true;
                    if (
                      document.name === this.configuration.db + '.test_collection_names' ||
                      document.name === 'test_collection_names'
                    )
                      found2 = true;
                  });

                  expect(found).to.be.true;
                  expect(found2).to.be.true

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.collection('does-not-exist', { strict: true }, err => {
            expect(err instanceof Error).to.be.true;
            expect('Collection does-not-exist does not exist. Currently in strict mode.').to.equal(err.message);
            db.createCollection('test_strict_access_collection', err => {
              expect(err).to.not.exist;
              db.collection(
                'test_strict_access_collection',
                this.configuration.writeConcernMax(),
                (err, collection) => {
                  expect(err).to.not.exist;
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('test_strict_create_collection', (err, collection) => {
            expect(err).to.not.exist;
            expect('test_strict_create_collection').to.equal(collection.collectionName);

            // Creating an existing collection should fail
            db.createCollection('test_strict_create_collection', { strict: true }, err => {
              expect(err instanceof Error).to.be.true;
              expect('Collection test_strict_create_collection already exists. Currently in strict mode.').to.equal(err.message);

              // Switch out of strict mode and try to re-create collection
              db.createCollection(
                'test_strict_create_collection',
                { strict: false },
                (err, collection) => {
                  expect(err).to.not.exist;

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
    it('should fail to insert due to illegal keys', {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      // The actual test we wish to run
      test: function(done) {
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('test_invalid_key_names', (err, collection) => {
            // Legal inserts
            collection.insert(
              [{ hello: 'world' }, { hello: { hello: 'world' } }],
              this.configuration.writeConcernMax(),
              err => {
                expect(err).to.not.exist;

                // Illegal insert for key
                collection.insert(
                  { $hello: 'world' },
                  this.configuration.writeConcernMax(),
                  err => {
                    expect(err instanceof Error).to.be.true;
                    expect("key $hello must not start with '$'").to.equal(err.message);

                    collection.insert(
                      { hello: { $hello: 'world' } },
                      this.configuration.writeConcernMax(),
                      err => {
                        expect(err instanceof Error).to.be.true;
                        expect("key $hello must not start with '$'").to.equal(err.message);

                        collection.insert(
                          { he$llo: 'world' },
                          this.configuration.writeConcernMax(),
                          err => {
                            expect(err).to.not.exist;

                            collection.insert(
                              { hello: { hell$o: 'world' } },
                              this.configuration.writeConcernMax(),
                              err => {
                                expect(err).to.not.exist;

                                collection.insert(
                                  { '.hello': 'world' },
                                  this.configuration.writeConcernMax(),
                                  err => {
                                    expect(err instanceof Error).to.be.true;
                                    expect("key .hello must not contain '.'").to.equal(err.message);

                                    collection.insert(
                                      { hello: { '.hello': 'world' } },
                                      this.configuration.writeConcernMax(),
                                      err => {
                                        expect(err instanceof Error).to.be.true;
                                        expect("key .hello must not contain '.'").to.equal(err.message);

                                        collection.insert(
                                          { 'hello.': 'world' },
                                          this.configuration.writeConcernMax(),
                                          err => {
                                            expect(err instanceof Error).to.be.true;
                                            expect("key hello. must not contain '.'").to.equal(err.message);

                                            collection.insert(
                                              { hello: { 'hello.': 'world' } },
                                              this.configuration.writeConcernMax(),
                                              err => {
                                                expect(err instanceof Error).to.be.true;
                                                expect("key hello. must not contain '.'").to.equal(err.message);
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
                  }
                );
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.collection(5, err => {
            expect('collection name must be a String').to.equal(err.message);
          });

          db.collection('', err => {
            expect('collection names cannot be empty').to.equal(err.message);
          });

          db.collection('te$t', err => {
            expect("collection names must not contain '$'").to.equal(err.message);
          });

          db.collection('.test', err => {
            expect("collection names must not start or end with '.'").to.equal(err.message);
          });

          db.collection('test.', err => {
            expect("collection names must not start or end with '.'").to.equal(err.message);
          });

          db.collection('test..t', err => {
            expect('collection names cannot be empty').to.equal(err.message);
            client.close();
            done();
          });
        });
      }
    });

    it('should return invalid collection name error by callback for createCollection', {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db('test_crate_collection');
          db.dropDatabase(err => {
            expect(err).to.not.exist;

            db.createCollection('test/../', err => {
              expect(err).to.exist;
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
    it('should crrectly count on non-existent collection', {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      // The actual test we wish to run
      test: function(done) {
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.collection('test_multiple_insert_2', (err, collection) => {
            collection.count((err, count) => {
              expect(count).to.equal(0)
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('test_save', (err, collection) => {
            const doc = { hello: 'world' };
            collection.save(doc, this.configuration.writeConcernMax(), (err, r) => {
              expect(r.ops[0]._id != null).to.be.true;

              collection.count((err, count) => {
                expect(count).to.equal(1)

                collection.save(r.ops[0], this.configuration.writeConcernMax(), err => {
                  expect(err).to.not.exist;
                  collection.count((err, count) => {
                    expect(count).to.equal(1)

                    collection.findOne((err, doc3) => {
                      expect('world').to.equal(doc3.hello);

                      doc3.hello = 'mike';

                      collection.save(doc3, this.configuration.writeConcernMax(), err => {
                        expect(err).to.not.exist;
                        collection.count((err, count) => {
                          expect(count).to.equal(1)

                          collection.findOne((err, doc5) => {
                            expect('mike').to.equal(doc5.hello);

                            // Save another document
                            collection.save(
                              { hello: 'world' },
                              this.configuration.writeConcernMax(),
                              err => {
                                expect(err).to.not.exist;
                                collection.count((err, count) => {
                                  expect(count).to.equal(2);
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
        const Long = this.configuration.require.Long;
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('test_save_long', (err, collection) => {
            collection.insert(
              { x: Long.fromNumber(9223372036854775807) },
              this.configuration.writeConcernMax(),
              err => {
                expect(err).to.not.exist;
                collection.findOne((err, doc) => {
                  expect(err).to.not.exist;
                  expect(Long.fromNumber(9223372036854775807)).to.deep.equal(doc.x);
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection(
            'test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection',
            (err, collection) => {
              const a = { _id: '1', hello: 'world' };
              collection.save(a, this.configuration.writeConcernMax(), err => {
                expect(err).to.not.exist;
                collection.count((err, count) => {
                  expect(count).to.equal(1)

                  collection.findOne((err, doc) => {
                    expect('world').to.equal(doc.hello);

                    doc.hello = 'mike';
                    collection.save(doc, this.configuration.writeConcernMax(), err => {
                      expect(err).to.not.exist;
                      collection.findOne((err, doc) => {
                        collection.count((err, count) => {
                          expect(count).to.equal(1)

                          expect('mike').to.equal(doc.hello);
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
        const ObjectID = this.configuration.require.ObjectID;

        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('test_should_correctly_do_update_with_no_docs', (err, collection) => {
            const id = new ObjectID(null);
            const doc = { _id: id, a: 1 };

            collection.update({ _id: id }, doc, this.configuration.writeConcernMax(), (err, r) => {
              expect(err).to.not.exist;
              expect(0).to.equal(r.result.n);

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection(
            'test_should_execute_insert_update_delete_safe_mode',
            (err, collection) => {
              expect('test_should_execute_insert_update_delete_safe_mode').to.equal(collection.collectionName);

              collection.insert({ i: 1 }, this.configuration.writeConcernMax(), (err, r) => {
                expect(1).to.equal(r.ops.length);
                expect(r.ops[0]._id.toHexString().length === 24).to.be.true;

                // Update the record
                collection.update(
                  { i: 1 },
                  { $set: { i: 2 } },
                  this.configuration.writeConcernMax(),
                  err => {
                    expect(err).to.not.exist;
                    expect(1).to.equal(r.result.n);

                    // Remove safely
                    collection.remove({}, this.configuration.writeConcernMax(), err => {
                      expect(err).to.not.exist;

                      client.close();
                      done();
                    });
                  }
                );
              });
            }
          );
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('multiple_save_test', (err, collection) => {
            const doc = {
              name: 'amit',
              text: 'some text'
            };

            //insert new user
            collection.save(doc, this.configuration.writeConcernMax(), err => {
              expect(err).to.not.exist;

              collection
                .find({}, { name: 1 })
                .limit(1)
                .toArray((err, users) => {
                  const user = users[0];

                  if (err) {
                    throw new Error(err);
                  } else if (user) {
                    user.pants = 'worn';

                    collection.save(user, this.configuration.writeConcernMax(), (err, result) => {
                      expect(err).to.not.exist;
                      expect(1).to.equal(result.result.n);
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
        const ObjectID = this.configuration.require.ObjectID;

        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('save_error_on_save_test', (err, collection) => {
            // Create unique index for username
            collection.createIndex([['username', 1]], this.configuration.writeConcernMax(), err => {
              expect(err).to.not.exist;
              const doc = {
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
              collection.save(doc, this.configuration.writeConcernMax(), err => {
                expect(err).to.not.exist;

                collection
                  .find({})
                  .limit(1)
                  .toArray((err, users) => {
                    expect(err).to.not.exist;
                    const user = users[0];
                    user.friends.splice(1, 1);

                    collection.save(user, err => {
                      expect(err).to.not.exist;

                      // Update again
                      collection.update(
                        { _id: new ObjectID(user._id.toString()) },
                        { friends: user.friends },
                        { upsert: true, w: 1 },
                        (err, result) => {
                          expect(err).to.not.exist;
                          expect(1).to.equal(result.result.n);

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.collection('remove_with_no_callback_bug_test', (err, collection) => {
            expect(err).to.not.exist;
            collection.save({ a: 1 }, this.configuration.writeConcernMax(), err => {
              expect(err).to.not.exist;
              collection.save({ b: 1 }, this.configuration.writeConcernMax(), err => {
                expect(err).to.not.exist;
                collection.save({ c: 1 }, this.configuration.writeConcernMax(), err => {
                  expect(err).to.not.exist;
                  collection.remove({ a: 1 }, this.configuration.writeConcernMax(), err => {
                    expect(err).to.not.exist;
                    // Let's perform a count
                    collection.count((err, count) => {
                      expect(err).to.not.exist;
                      expect(count).to.equal(2);
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection(
            'shouldCorrectlyCreateTTLCollectionWithIndexUsingEnsureIndex',
            (err, collection) => {
              collection.ensureIndex({ createdAt: 1 }, { expireAfterSeconds: 1, w: 1 }, err => {
                expect(err).to.not.exist;

                // Insert a document with a date
                collection.insert(
                  { a: 1, createdAt: new Date() },
                  this.configuration.writeConcernMax(),
                  err => {
                    expect(err).to.not.exist;

                    collection.indexInformation({ full: true }, (err, indexes) => {
                      expect(err).to.not.exist;

                      for (let i = 0; i < indexes.length; i++) {
                        if (indexes[i].name === 'createdAt_1') {
                          expect(1).to.equal(indexes[i].expireAfterSeconds);
                          break;
                        }
                      }

                      client.close();
                      done();
                    });
                  }
                );
              });
            }
          );
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection(
            'shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex',
            {},
            (err, collection) => {
              collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 1, w: 1 }, err => {
                expect(err).to.not.exist;

                // Insert a document with a date
                collection.insert(
                  { a: 1, createdAt: new Date() },
                  this.configuration.writeConcernMax(),
                  err => {
                    expect(err).to.not.exist;

                    collection.indexInformation({ full: true }, (err, indexes) => {
                      expect(err).to.not.exist;

                      for (let i = 0; i < indexes.length; i++) {
                        if (indexes[i].name === 'createdAt_1') {
                          expect(1).to.equal(indexes[i].expireAfterSeconds);
                          break;
                        }
                      }

                      client.close();
                      done();
                    });
                  }
                );
              });
            }
          );
        });
      }
    });

    /**
     * @ignore
     */
    it('should support createIndex with no options', {
      metadata: {
        requires: {
          mongodb: '>2.1.0',
          topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
        }
      },

      // The actual test we wish to run
      test: function(done) {
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('create_index_without_options', {}, (err, collection) => {
            collection.createIndex({ createdAt: 1 }, err => {
              expect(err).to.not.exist;

              collection.indexInformation({ full: true }, (err, indexes) => {
                expect(err).to.not.exist;
                const indexNames = indexes.map(i => i.name);
                expect(indexNames).to.include('createdAt_1');

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
    it('should correctly read back document with null', {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      // The actual test we wish to run
      test: function(done) {
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('shouldCorrectlyReadBackDocumentWithNull', {}, (err, collection) => {
            // Insert a document with a date
            collection.insert({ test: null }, this.configuration.writeConcernMax(), err => {
              expect(err).to.not.exist;

              collection.findOne(err => {
                expect(err).to.not.exist;

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection('shouldThrowErrorDueToIllegalUpdate', {}, (err, coll) => {
            try {
              coll.update({}, null, () => {});
            } catch (err) {
              expect('document must be a valid JavaScript object').to.equal(err.message);
            }

            try {
              coll.update(null, null, () => {});
            } catch (err) {
              expect('selector must be a valid JavaScript object').to.equal(err.message);
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.collection('shouldCorrectlyHandle0asIdForSave').save({ _id: 0 }, err => {
            expect(err).to.not.exist;

            db.collection('shouldCorrectlyHandle0asIdForSave').save({ _id: 0 }, err => {
              expect(err).to.not.exist;
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db
            .collection('executeUpdateWithElemMatch')
            .update({ 'item.i': 1 }, { $set: { a: 1 } }, err => {
              expect(err).to.not.exist;

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db
            .collection('executeUpdateWithElemMatch')
            .update({ item: { $elemMatch: { name: 'my_name' } } }, { $set: { a: 1 } }, err => {
              expect(err).to.not.exist;

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          db.createCollection(
            'shouldFailDueToExistingCollection',
            { strict: true },
            (err, coll) => {
              expect(err).to.not.exist;
              expect(coll != null).to.be.true;

              db.createCollection('shouldFailDueToExistingCollection', { strict: true }, err => {
                expect(err != null).to.be.true;

                client.close();
                done();
              });
            }
          );
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
        const testCollection = 'integration_tests_collection_123'; // The collection happens to contain the database name

        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);
          // Create a collection
          db.createCollection(testCollection, err => {
            expect(err).to.not.exist;

            db.listCollections({ name: testCollection }).toArray((err, documents) => {
              expect(err).to.not.exist;
              expect(documents.length).to.equal(1);
              let found = false;
              documents.forEach(document => {
                if (document.name === testCollection) found = true;
              });
              expect(found).to.be.true;
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
        const testCollection = 'collection_124';

        client.connect((err, client) => {
          const db = client.db(this.configuration.db);
          // Create a collection
          db.createCollection(testCollection, err => {
            expect(err).to.not.exist;

            // Index name happens to be the same as collection name
            db.createIndex(testCollection, 'collection_124', { w: 1 }, (err, indexName) => {
              expect(err).to.not.exist;
              expect('collection_124_1').to.equal(indexName);

              db.listCollections().toArray((err, documents) => {
                expect(err).to.not.exist;
                expect(documents.length > 1).to.be.true;
                let found = false;

                documents.forEach(document => {
                  if (document.name === testCollection) found = true;
                });

                expect(found).to.be.true;
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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          expect(err).to.not.exist;
          const emptyDb = client.db('listCollectionsDb');
          emptyDb.createCollection('test1', err => {
            expect(err).to.not.exist;

            emptyDb.createCollection('test2', err => {
              expect(err).to.not.exist;

              emptyDb.createCollection('test3', err => {
                expect(err).to.not.exist;

                emptyDb.listCollections().toArray((err, collections) => {
                  expect(err).to.not.exist;
                  // By name
                  let names = {};

                  for (let i = 0; i < collections.length; i++) {
                    names[collections[i].name] = collections[i];
                  }

                  expect(names['test1'] != null).to.be.true;
                  expect(names['test2'] != null).to.be.true;
                  expect(names['test3'] != null).to.be.true;

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          expect(err).to.not.exist;
          const emptyDb = client.db('listCollectionsDb');
          emptyDb.createCollection('test1', err => {
            expect(err).to.not.exist;

            emptyDb.createCollection('test2', err => {
              expect(err).to.not.exist;

              emptyDb.createCollection('test3', err => {
                expect(err).to.not.exist;

                emptyDb.listCollections().toArray((err, collections) => {
                  expect(err).to.not.exist;
                  // By name
                  let names = {};

                  for (let i = 0; i < collections.length; i++) {
                    names[collections[i].name] = collections[i];
                  }

                  expect(names['test1'] != null).to.be.true;
                  expect(names['test2'] != null).to.be.true;
                  expect(names['test3'] != null).to.be.true;

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
        client.connect((err, client) => {
          expect(err).to.not.exist;
          expect(err).to.not.exist;
          const emptyDb = client.db('listCollectionsDb2');
          emptyDb.createCollection('test1', err => {
            expect(err).to.not.exist;

            emptyDb.createCollection('test.test', err => {
              expect(err).to.not.exist;

              emptyDb.createCollection('test3', err => {
                expect(err).to.not.exist;

                emptyDb.collections((err, collections) => {
                  collections = collections.map(collection => {
                    return {
                      collectionName: collection.collectionName,
                      namespace: collection.namespace
                    };
                  });

                  let foundCollection = false;
                  collections.forEach(x => {
                    if (
                      x.namespace === 'listCollectionsDb2.test.test' &&
                      x.collectionName === 'test.test'
                    ) {
                      foundCollection = true;
                    }
                  });

                  expect(foundCollection).to.be.true;
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
    it('should provide access to the database name', {
      metadata: {
        requires: { topology: ['single'] }
      },

      test: () => {
        return client
          .connect()
          .then(client => client.db('test_db').createCollection('test1'))
          .then(coll => {
            expect(coll.dbName).to.equal('test_db');
            return client.close();
          });
      }
    });

    it('should correctly update with pipeline', {
      metadata: {
        requires: { mongodb: '>=4.2.0' }
      },

      // The actual test we wish to run
      test: function(done) {
        client.connect((err, client) => {
          expect(err).to.not.exist;
          const db = client.db(this.configuration.db);

          db.createCollection(
            'test_should_correctly_do_update_with_pipeline',
            (err, collection) => {
              collection.updateOne(
                {},
                [{ $set: { a: 1 } }, { $set: { b: 1 } }, { $set: { d: 1 } }],
                this.configuration.writeConcernMax(),
                (err, r) => {
                  expect(err).to.not.exist;
                  expect(r.result.n).to.equal(0);

                  client.close(done);
                }
              );
            }
          );
        });
      }
    });
  });

  describe('', function() {
    let configuration;
    let client;
    beforeEach(function() {
      configuration = this.configuration;
      client = configuration.newClient({}, { w: 1 });
    });
    afterEach(function() {
      return client.close();
    });

    it('should correctly perform estimatedDocumentCount on non-matching query', function(done) {
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        const collection = db.collection('nonexistent_coll_1');
        const close = e => client.close(() => done(e));

        Promise.resolve()
          .then(() => collection.estimatedDocumentCount({ a: 'b' }))
          .then(count => expect(count).to.equal(0))
          .then(() => close())
          .catch(e => close(e));
      });
    });

    it('should correctly perform countDocuments on non-matching query', function(done) {
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        const collection = db.collection('nonexistent_coll_2');
        const close = e => client.close(() => done(e));

        Promise.resolve()
          .then(() => collection.countDocuments({ a: 'b' }))
          .then(count => expect(count).to.equal(0))
          .then(() => close())
          .catch(e => close(e));
      });
    });

    it('countDocuments should return Promise that resolves when no callback passed', function(done) {
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        const collection = db.collection('countDoc_return_promise');
        const docsPromise = collection.countDocuments();
        const close = e => client.close(() => done(e));

        expect(docsPromise).to.exist.and.to.be.an.instanceof(collection.s.promiseLibrary);

        docsPromise
          .then(result => expect(result).to.equal(0))
          .then(() => close())
          .catch(e => close(e));
      });
    });

    it('countDocuments should not return a promise if callback given', function(done) {
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        const collection = db.collection('countDoc_no_promise');
        const close = e => client.close(() => done(e));

        const notPromise = collection.countDocuments({ a: 1 }, () => {
          expect(notPromise).to.be.undefined;
          close();
        });
      });
    });

    it('countDocuments should correctly call the given callback', function(done) {
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        const collection = db.collection('countDoc_callback');
        const docs = [{ a: 1 }, { a: 2 }];
        const close = e => client.close(() => done(e));

        collection.insertMany(docs).then(() =>
          collection.countDocuments({ a: 1 }, (err, data) => {
            expect(data).to.equal(1);
            close(err);
          })
        );
      });
    });
  });

  describe('countDocuments with mock server', () => {
    let server;

    beforeEach(() => {
      return mock.createServer().then(s => {
        server = s;
      });
    });

    afterEach(() => mock.cleanup());

    function testCountDocMock(testConfiguration, config, done) {
      const client = testConfiguration.newClient(`mongodb://${server.uri()}/test`);
      const close = e => client.close(() => done(e));

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.aggregate) {
          try {
            config.replyHandler(doc);
            request.reply(config.reply);
          } catch (e) {
            close(e);
          }
        }

        if (doc.ismaster) {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      client.connect((err, client) => {
        const db = client.db('test');
        const collection = db.collection('countDoc_mock');

        config.executeCountDocuments(collection, close);
      });
    }

    it('countDocuments should return appropriate error if aggregation fails with callback given', function(done) {
      const replyHandler = () => {};
      const executeCountDocuments = (collection, close) => {
        collection.countDocuments(err => {
          expect(err).to.exist;
          expect(err.errmsg).to.equal('aggregation error - callback');
          close();
        });
      };

      testCountDocMock(
        this.configuration,
        {
          replyHandler,
          executeCountDocuments,
          reply: { ok: 0, errmsg: 'aggregation error - callback' }
        },
        done
      );
    });

    it('countDocuments should error if aggregation fails using Promises', function(done) {
      const replyHandler = () => {};
      const executeCountDocuments = (collection, close) => {
        collection
          .countDocuments()
          .then(() => expect(false).to.equal(true)) // should never get here; error should be caught
          .catch(e => {
            expect(e.errmsg).to.equal('aggregation error - promise');
            close();
          });
      };

      testCountDocMock(
        this.configuration,
        {
          replyHandler,
          executeCountDocuments,
          reply: { ok: 0, errmsg: 'aggregation error - promise' }
        },
        done
      );
    });

    it('countDocuments pipeline should be correct with skip and limit applied', function(done) {
      const replyHandler = doc => {
        expect(doc.pipeline).to.deep.include({ $skip: 1 });
        expect(doc.pipeline).to.deep.include({ $limit: 1 });
      };
      const executeCountDocuments = (collection, close) => {
        collection.countDocuments({}, { limit: 1, skip: 1 }, err => {
          expect(err).to.not.exist;
          close();
        });
      };

      testCountDocMock(
        this.configuration,
        {
          replyHandler,
          executeCountDocuments,
          reply: { ok: 1 }
        },
        done
      );
    });
  });

  function testCapped(testConfiguration, config, done) {
    const configuration = config.config;
    const client = testConfiguration.newClient({}, { w: 1 });

    client.connect((err, client) => {
      const db = client.db(configuration.db);
      const close = e => client.close(() => done(e));

      db
        .createCollection(config.collName, config.opts)
        .then(collection => collection.isCapped())
        .then(capped => expect(capped).to.be.false)
        .then(() => close())
        .catch(e => close(e));
    });
  }

  it('isCapped should return false for uncapped collections', function(done) {
    testCapped(
      this.configuration,
      { config: this.configuration, collName: 'uncapped', opts: { capped: false } },
      done
    );
  });

  it('isCapped should return false for collections instantiated without specifying capped', function(done) {
    testCapped(
      this.configuration,
      { config: this.configuration, collName: 'uncapped2', opts: {} },
      done
    );
  });

  describe('Retryable Writes on bulk ops', () => {
    let client;
    let db;
    let collection;

    const metadata = { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } };

    beforeEach(function() {
      client = this.configuration.newClient({}, { retryWrites: true });
      return client.connect().then(() => {
        db = client.db('test_retry_writes');
        collection = db.collection('tests');

        return Promise.resolve()
          .then(() => db.dropDatabase())
          .then(() => collection.insert({ name: 'foobar' }));
      });
    });

    afterEach(function() {
      return client.close();
    });

    it('should succeed with retryWrite=true when using updateMany', {
      metadata,
      test: () => {
        return collection.updateMany({ name: 'foobar' }, { $set: { name: 'fizzbuzz' } });
      }
    });

    it('should succeed with retryWrite=true when using update with multi=true', {
      metadata,
      test: () => {
        return collection.update(
          { name: 'foobar' },
          { $set: { name: 'fizzbuzz' } },
          { multi: true }
        );
      }
    });

    it('should succeed with retryWrite=true when using remove without option single', {
      metadata,
      test: () => {
        return collection.remove({ name: 'foobar' });
      }
    });

    it('should succeed with retryWrite=true when using deleteMany', {
      metadata,
      test: () => {
        return collection.deleteMany({ name: 'foobar' });
      }
    });
  });
});

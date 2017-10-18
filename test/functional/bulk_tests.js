'use strict';
const test = require('./shared').assert,
  setupDatabase = require('./shared').setupDatabase,
  expect = require('chai').expect;

describe('Bulk', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('should correctly handle ordered single batch api write command error', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_1');

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, function(err) {
          test.equal(err, null);

          var batch = col.initializeOrderedBulkOp();
          batch.insert({ b: 1, a: 1 });
          batch
            .find({ b: 2 })
            .upsert()
            .updateOne({ $set: { a: 1 } });
          batch.insert({ b: 3, a: 2 });

          batch.execute(function(err, result) {
            expect(err).to.exist;
            expect(result).to.not.exist;

            result = err.result;

            // Basic properties check
            test.equal(1, result.nInserted);
            test.equal(true, result.hasWriteErrors());
            test.equal(1, result.getWriteErrorCount());

            // Get the write error
            var error = result.getWriteErrorAt(0);
            test.equal(11000, error.code);
            test.ok(error.errmsg != null);

            // Get the operation that caused the error
            var op = error.getOperation();
            test.equal(2, op.q.b);
            test.equal(1, op.u['$set'].a);
            test.equal(false, op.multi);
            test.equal(true, op.upsert);

            // Get the first error
            error = result.getWriteErrorAt(1);
            test.equal(null, error);

            // Finish up test
            client.close();
            done();
          });
        });
      });
    }
  });

  it('should ignore undefined values in unordered bulk operation if `ignoreUndefined` specified', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function() {
      const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      return client
        .connect()
        .then(client => {
          const db = client.db(this.configuration.db);
          const col = db.collection('batch_write_unordered_ops_1');

          return col
            .initializeUnorderedBulkOp({ ignoreUndefined: true })
            .insert({ a: 1, b: undefined })
            .execute()
            .then(() => col.find({}).toArray())
            .then(docs => {
              expect(docs[0]['a']).to.equal(1);
              expect(docs[0]['b']).to.not.exist;
            });
        })
        .then(() => client.close());
    }
  });

  it('should ignore undefined values in ordered bulk operation if `ignoreUndefined` specified', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function() {
      var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      return client.connect().then(client => {
        var db = client.db(this.configuration.db);
        var col = db.collection('batch_write_ordered_ops_1');

        return col
          .initializeOrderedBulkOp({ ignoreUndefined: true })
          .insert({ a: 1, b: undefined })
          .execute()
          .then(() => col.find({}).toArray())
          .then(docs => {
            expect(docs[0]['a']).to.equal(1);
            expect(docs[0]['b']).to.not.exist;
          })
          .then(() => client.close());
      });
    }
  });

  it('should correctly handle ordered multiple batch api write command error', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_2');

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, function(err) {
          test.equal(err, null);

          var batch = col.initializeOrderedBulkOp();
          batch.insert({ b: 1, a: 1 });
          batch
            .find({ b: 2 })
            .upsert()
            .updateOne({ $set: { a: 1 } });
          batch
            .find({ b: 3 })
            .upsert()
            .updateOne({ $set: { a: 2 } });
          batch
            .find({ b: 2 })
            .upsert()
            .updateOne({ $set: { a: 1 } });
          batch.insert({ b: 4, a: 3 });
          batch.insert({ b: 5, a: 1 });

          batch.execute(function(err, result) {
            expect(err).to.exist;
            expect(result).to.not.exist;

            // Basic properties check
            result = err.result;
            test.equal(err instanceof Error, true);
            test.equal(1, result.nInserted);
            test.equal(true, result.hasWriteErrors());
            test.ok(1, result.getWriteErrorCount());

            // Individual error checking
            var error = result.getWriteErrorAt(0);
            test.equal(1, error.index);
            test.equal(11000, error.code);
            test.ok(error.errmsg != null);
            test.equal(2, error.getOperation().q.b);
            test.equal(1, error.getOperation().u['$set'].a);
            test.equal(false, error.getOperation().multi);
            test.equal(true, error.getOperation().upsert);

            // Finish up test
            client.close();
            done();
          });
        });
      });
    }
  });

  it('should fail due to ordered document being to big', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var coll = db.collection('batch_write_ordered_ops_3');
        // Set up a giant string to blow through the max message size
        var hugeString = '';
        // Create it bigger than 16MB
        for (var i = 0; i < 1024 * 1100; i++) {
          hugeString = hugeString + '1234567890123456';
        }

        // Set up the batch
        var batch = coll.initializeOrderedBulkOp();
        batch.insert({ b: 1, a: 1 });
        // should fail on insert due to string being to big
        try {
          batch.insert({ string: hugeString });
          test.ok(false);
        } catch (err) {} // eslint-disable-line

        // Finish up test
        client.close();
        done();
      });
    }
  });

  it('should correctly split up ordered messages into more batches', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var coll = db.collection('batch_write_ordered_ops_4');

        // Set up a giant string to blow through the max message size
        var hugeString = '';
        // Create it bigger than 16MB
        for (var i = 0; i < 1024 * 256; i++) {
          hugeString = hugeString + '1234567890123456';
        }

        // Insert the string a couple of times, should force split into multiple batches
        var batch = coll.initializeOrderedBulkOp();
        batch.insert({ a: 1, b: hugeString });
        batch.insert({ a: 2, b: hugeString });
        batch.insert({ a: 3, b: hugeString });
        batch.insert({ a: 4, b: hugeString });
        batch.insert({ a: 5, b: hugeString });
        batch.insert({ a: 6, b: hugeString });

        // Execute the operations
        batch.execute(function(err, result) {
          // Basic properties check
          test.equal(6, result.nInserted);
          test.equal(false, result.hasWriteErrors());

          // Finish up test
          client.close();
          done();
        });
      });
    }
  });

  it(
    'should Correctly Fail Ordered Batch Operation due to illegal Operations using write commands',
    {
      metadata: {
        requires: {
          mongodb: '>2.5.4',
          topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
        }
      },

      test: function(done) {
        var self = this;
        var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect(function(err, client) {
          var db = client.db(self.configuration.db);
          var col = db.collection('batch_write_ordered_ops_5');

          // Add unique index on b field causing all updates to fail
          col.ensureIndex({ b: 1 }, { unique: true, sparse: false }, function(err) {
            test.equal(err, null);

            var batch = col.initializeOrderedBulkOp();

            // Add illegal insert operation
            batch.insert({ $set: { a: 1 } });

            // Execute the operations
            batch.execute(function(err) {
              test.ok(err != null);

              var batch = col.initializeOrderedBulkOp();
              // Add illegal remove
              batch.find({ $set: { a: 1 } }).removeOne();
              // Execute the operations
              batch.execute(function(err) {
                test.ok(err != null);

                var batch = col.initializeOrderedBulkOp();
                // Add illegal update
                batch.find({ a: { $set2: 1 } }).updateOne({ c: { $set: { a: 1 } } });
                // Execute the operations
                batch.execute(function(err) {
                  test.ok(err != null);

                  client.close();
                  done();
                });
              });
            });
          });
        });
      }
    }
  );

  it(
    'should Correctly Execute Ordered Batch of Write Operations with duplicate key errors on updates',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        var self = this;
        var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect(function(err, client) {
          var db = client.db(self.configuration.db);
          var col = db.collection('batch_write_ordered_ops_6');

          // Add unique index on b field causing all updates to fail
          col.ensureIndex({ b: 1 }, { unique: true, sparse: false }, function(err) {
            test.equal(err, null);

            var batch = col.initializeOrderedBulkOp();

            // Add some operations to be executed in order
            batch.insert({ a: 1 });
            batch.find({ a: 1 }).update({ $set: { b: 1 } });
            batch.insert({ b: 1 });

            // Execute the operations
            batch.execute(function(err, result) {
              expect(err).to.exist;
              expect(result).to.not.exist;

              // Test basic settings
              result = err.result;
              test.equal(1, result.nInserted);
              test.equal(1, result.nMatched);
              test.ok(1 === result.nModified || result.nModified == null);
              test.equal(true, result.hasWriteErrors());
              test.ok(1, result.getWriteErrorCount());

              // Individual error checking
              var error = result.getWriteErrorAt(0);
              test.equal(2, error.index);
              test.equal(11000, error.code);
              test.ok(error.errmsg != null);
              test.equal(1, error.getOperation().b);

              client.close();
              done();
            });
          });
        });
      }
    }
  );

  it(
    'should Correctly Execute Ordered Batch of Write Operations with upserts causing duplicate key errors on updates',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        var self = this;
        var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect(function(err, client) {
          var db = client.db(self.configuration.db);
          var col = db.collection('batch_write_ordered_ops_7');

          // Add unique index on b field causing all updates to fail
          col.ensureIndex({ b: 1 }, { unique: true, sparse: false }, function(err) {
            test.equal(err, null);

            var batch = col.initializeOrderedBulkOp();
            batch.insert({ a: 1 });
            batch.find({ a: 1 }).update({ $set: { b: 1 } });
            batch
              .find({ a: 2 })
              .upsert()
              .update({ $set: { b: 2 } });
            batch
              .find({ a: 3 })
              .upsert()
              .update({ $set: { b: 3 } });
            batch.insert({ b: 1 });

            // Execute the operations
            batch.execute(function(err, result) {
              expect(err).to.exist;
              expect(result).to.not.exist;

              // Test basic settings
              result = err.result;
              test.equal(1, result.nInserted);
              test.equal(2, result.nUpserted);
              test.equal(1, result.nMatched);
              test.ok(1 === result.nModified || result.nModified == null);
              test.equal(true, result.hasWriteErrors());
              test.ok(1, result.getWriteErrorCount());

              // Individual error checking
              var error = result.getWriteErrorAt(0);
              test.equal(4, error.index);
              test.equal(11000, error.code);
              test.ok(error.errmsg != null);
              test.equal(1, error.getOperation().b);

              // Check for upserted values
              var ids = result.getUpsertedIds();
              test.equal(2, ids.length);
              test.equal(2, ids[0].index);
              test.ok(ids[0]._id != null);
              test.equal(3, ids[1].index);
              test.ok(ids[1]._id != null);

              client.close();
              done();
            });
          });
        });
      }
    }
  );

  it('should correctly perform ordered upsert with custom _id', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_8');
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch
          .find({ _id: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });

        // Execute the operations
        batch.execute(function(err, result) {
          // Check state of result
          test.equal(1, result.nUpserted);
          test.equal(0, result.nInserted);
          test.equal(0, result.nMatched);
          test.ok(0 === result.nModified || result.nModified == null);
          test.equal(0, result.nRemoved);

          var upserts = result.getUpsertedIds();
          test.equal(1, upserts.length);
          test.equal(0, upserts[0].index);
          test.equal(2, upserts[0]._id);

          // Finish up test
          client.close();
          done();
        });
      });
    }
  });

  it('should return an error when no operations in ordered batch', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_8');

        col.initializeOrderedBulkOp().execute(function(err) {
          test.equal(err instanceof Error, true);
          test.equal(err.message, 'Invalid Operation, no operations specified');

          client.close();
          done();
        });
      });
    }
  });

  it('should correctly execute ordered batch using w:0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_9');

        var bulk = col.initializeOrderedBulkOp();
        for (var i = 0; i < 100; i++) {
          bulk.insert({ a: 1 });
        }

        bulk
          .find({ b: 1 })
          .upsert()
          .update({ b: 1 });
        bulk.find({ c: 1 }).remove();

        bulk.execute({ w: 0 }, function(err, result) {
          test.equal(null, err);
          test.equal(0, result.nUpserted);
          test.equal(0, result.nInserted);
          test.equal(0, result.nMatched);
          test.ok(0 === result.nModified || result.nModified == null);
          test.equal(0, result.nRemoved);
          test.equal(false, result.hasWriteErrors());

          client.close();
          done();
        });
      });
    }
  });

  it('should correctly handle single unordered batch API', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_1');

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, function(err) {
          test.equal(err, null);

          // Initialize the unordered Batch
          var batch = col.initializeUnorderedBulkOp();

          // Add some operations to be executed in order
          batch.insert({ b: 1, a: 1 });
          batch
            .find({ b: 2 })
            .upsert()
            .updateOne({ $set: { a: 1 } });
          batch.insert({ b: 3, a: 2 });

          // Execute the operations
          batch.execute(function(err, result) {
            expect(err).to.exist;
            expect(result).to.not.exist;

            // Basic properties check
            result = err.result;
            test.equal(err instanceof Error, true);
            test.equal(2, result.nInserted);
            test.equal(0, result.nUpserted);
            test.equal(0, result.nMatched);
            test.ok(0 === result.nModified || result.nModified == null);
            test.equal(true, result.hasWriteErrors());
            test.equal(1, result.getWriteErrorCount());

            // Get the first error
            var error = result.getWriteErrorAt(0);
            test.equal(11000, error.code);
            test.ok(error.errmsg != null);

            // Get the operation that caused the error
            var op = error.getOperation();
            test.equal(2, op.q.b);
            test.equal(1, op.u['$set'].a);
            test.equal(false, op.multi);
            test.equal(true, op.upsert);

            // Get the first error
            error = result.getWriteErrorAt(1);
            test.equal(null, error);

            // Finish up test
            client.close();
            done();
          });
        });
      });
    }
  });

  it('should correctly handle multiple unordered batch API', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_2');

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, function(err) {
          test.equal(err, null);

          // Initialize the unordered Batch
          var batch = col.initializeUnorderedBulkOp({ useLegacyOps: true });

          // Add some operations to be executed in order
          batch.insert({ b: 1, a: 1 });
          batch
            .find({ b: 2 })
            .upsert()
            .updateOne({ $set: { a: 1 } });
          batch
            .find({ b: 3 })
            .upsert()
            .updateOne({ $set: { a: 2 } });
          batch
            .find({ b: 2 })
            .upsert()
            .updateOne({ $set: { a: 1 } });
          batch.insert({ b: 4, a: 3 });
          batch.insert({ b: 5, a: 1 });

          // Execute the operations
          batch.execute(function(err, result) {
            expect(err).to.exist;
            expect(result).to.not.exist;

            // Basic properties check
            result = err.result;
            test.equal(2, result.nInserted);
            test.equal(true, result.hasWriteErrors());
            test.ok(3, result.getWriteErrorCount());

            // Go over all the errors
            for (var i = 0; i < result.getWriteErrorCount(); i++) {
              var error = result.getWriteErrorAt(i);

              switch (error.index) {
                case 1:
                  test.equal(11000, error.code);
                  test.ok(error.errmsg != null);
                  test.equal(2, error.getOperation().q.b);
                  test.equal(1, error.getOperation().u['$set'].a);
                  test.equal(false, error.getOperation().multi);
                  test.equal(true, error.getOperation().upsert);
                  break;
                case 3:
                  test.equal(11000, error.code);
                  test.ok(error.errmsg != null);
                  test.equal(2, error.getOperation().q.b);
                  test.equal(1, error.getOperation().u['$set'].a);
                  test.equal(false, error.getOperation().multi);
                  test.equal(true, error.getOperation().upsert);
                  break;
                case 2:
                  test.equal(11000, error.code);
                  test.ok(error.errmsg != null);
                  test.equal(5, error.getOperation().b);
                  test.equal(1, error.getOperation().a);
                  break;
                case 5:
                  test.equal(11000, error.code);
                  test.ok(error.errmsg != null);
                  test.equal(5, error.getOperation().b);
                  test.equal(1, error.getOperation().a);
                  break;
                default:
                  test.ok(false);
              }
            }

            // Finish up test
            client.close();
            done();
          });
        });
      });
    }
  });

  it('should fail due to document being to big for unordered batch', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var coll = db.collection('batch_write_unordered_ops_legacy_3');
        // Set up a giant string to blow through the max message size
        var hugeString = '';
        // Create it bigger than 16MB
        for (var i = 0; i < 1024 * 1100; i++) {
          hugeString = hugeString + '1234567890123456';
        }

        // Set up the batch
        var batch = coll.initializeUnorderedBulkOp();
        batch.insert({ b: 1, a: 1 });
        // should fail on insert due to string being to big
        try {
          batch.insert({ string: hugeString });
          test.ok(false);
        } catch (err) {} // eslint-disable-line

        // Finish up test
        client.close();
        done();
      });
    }
  });

  it('should correctly split up messages into more batches for unordered batches', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var coll = db.collection('batch_write_unordered_ops_legacy_4');

        // Set up a giant string to blow through the max message size
        var hugeString = '';
        // Create it bigger than 16MB
        for (var i = 0; i < 1024 * 256; i++) {
          hugeString = hugeString + '1234567890123456';
        }

        // Insert the string a couple of times, should force split into multiple batches
        var batch = coll.initializeUnorderedBulkOp();
        batch.insert({ a: 1, b: hugeString });
        batch.insert({ a: 2, b: hugeString });
        batch.insert({ a: 3, b: hugeString });
        batch.insert({ a: 4, b: hugeString });
        batch.insert({ a: 5, b: hugeString });
        batch.insert({ a: 6, b: hugeString });

        // Execute the operations
        batch.execute(function(err, result) {
          // Basic properties check
          test.equal(6, result.nInserted);
          test.equal(false, result.hasWriteErrors());

          // Finish up test
          client.close();
          done();
        });
      });
    }
  });

  it('should Correctly Fail Unordered Batch Operation due to illegal Operations', {
    metadata: {
      requires: {
        mongodb: '>2.5.4',
        topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_5');

        // Write concern
        var writeConcern = self.configuration.writeConcernMax();
        writeConcern.unique = true;
        writeConcern.sparse = false;

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ b: 1 }, writeConcern, function(err) {
          test.equal(err, null);

          // Initialize the unordered Batch
          var batch = col.initializeUnorderedBulkOp();

          // Add illegal insert operation
          batch.insert({ $set: { a: 1 } });

          // Execute the operations
          batch.execute(function(err) {
            test.ok(err != null);

            // Initialize the unordered Batch
            var batch = col.initializeUnorderedBulkOp();
            // Add illegal remove
            batch.find({ $set: { a: 1 } }).removeOne();
            // Execute the operations
            batch.execute(function(err) {
              test.ok(err != null);

              // Initialize the unordered Batch
              var batch = col.initializeUnorderedBulkOp();
              // Add illegal update
              batch.find({ $set: { a: 1 } }).updateOne({ c: { $set: { a: 1 } } });
              // Execute the operations
              batch.execute(function(err) {
                test.ok(err != null);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  it('should Correctly Execute Unordered Batch with duplicate key errors on updates', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_6');

        // Write concern
        var writeConcern = self.configuration.writeConcernMax();
        writeConcern.unique = true;
        writeConcern.sparse = false;

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ b: 1 }, writeConcern, function(err) {
          test.equal(err, null);

          // Initialize the unordered Batch
          var batch = col.initializeUnorderedBulkOp();

          // Add some operations to be executed in order
          batch.insert({ a: 1 });
          batch.find({ a: 1 }).update({ $set: { b: 1 } });
          batch.insert({ b: 1 });
          batch.insert({ b: 1 });
          batch.insert({ b: 1 });
          batch.insert({ b: 1 });

          // Execute the operations
          batch.execute(self.configuration.writeConcernMax(), function(err, result) {
            expect(err).to.exist;
            expect(result).to.not.exist;

            // Test basic settings
            result = err.result;
            test.equal(2, result.nInserted);
            test.equal(true, result.hasWriteErrors());
            test.ok(result.getWriteErrorCount() === 4 || result.getWriteErrorCount() === 3);

            // Individual error checking
            var error = result.getWriteErrorAt(0);
            test.ok(error.code === 11000 || error.code === 11001);
            test.ok(error.errmsg != null);

            client.close();
            done();
          });
        });
      });
    }
  });

  it(
    'should Correctly Execute Unordered Batch of with upserts causing duplicate key errors on updates',
    {
      metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

      test: function(done) {
        var self = this;
        var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect(function(err, client) {
          var db = client.db(self.configuration.db);
          var col = db.collection('batch_write_unordered_ops_legacy_7');

          // Add unique index on b field causing all updates to fail
          col.ensureIndex({ b: 1 }, { unique: true, sparse: false }, function(err) {
            test.equal(err, null);

            // Initialize the unordered Batch
            var batch = col.initializeUnorderedBulkOp();

            // Add some operations to be executed in order
            batch.insert({ a: 1 });
            batch.find({ a: 1 }).update({ $set: { b: 1 } });
            batch
              .find({ a: 2 })
              .upsert()
              .update({ $set: { b: 2 } });
            batch
              .find({ a: 3 })
              .upsert()
              .update({ $set: { b: 3 } });
            batch.find({ a: 1 }).update({ $set: { b: 1 } });
            batch.insert({ b: 1 });

            // Execute the operations
            batch.execute(self.configuration.writeConcernMax(), function(err, result) {
              expect(err).to.exist;
              expect(result).to.not.exist;

              // Test basic settings
              result = err.result;
              test.equal(2, result.nInserted);
              test.equal(2, result.nUpserted);
              test.ok(0 === result.nModified || result.nModified == null);
              test.equal(0, result.nRemoved);
              test.equal(true, result.hasWriteErrors());
              test.ok(1, result.getWriteErrorCount());

              // Individual error checking
              var error = result.getWriteErrorAt(0);
              test.ok(error.code === 11000 || error.code === 11001);
              test.ok(error.errmsg != null);
              test.equal(1, error.getOperation().u['$set'].b);

              // Check for upserted values
              var ids = result.getUpsertedIds();
              test.equal(2, ids.length);
              test.equal(2, ids[0].index);
              test.ok(ids[0]._id != null);
              test.equal(3, ids[1].index);
              test.ok(ids[1]._id != null);

              client.close();
              done();
            });
          });
        });
      }
    }
  );

  it('should correctly perform unordered upsert with custom _id', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_8');
        var batch = col.initializeUnorderedBulkOp();

        // Add some operations to be executed in order
        batch
          .find({ _id: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });

        // Execute the operations
        batch.execute(self.configuration.writeConcernMax(), function(err, result) {
          // Check state of result
          test.equal(1, result.nUpserted);
          test.equal(0, result.nInserted);
          test.equal(0, result.nMatched);
          test.ok(0 === result.nModified || result.nModified == null);
          test.equal(0, result.nRemoved);

          var upserts = result.getUpsertedIds();
          test.equal(1, upserts.length);
          test.equal(0, upserts[0].index);
          test.equal(2, upserts[0]._id);

          // Finish up test
          client.close();
          done();
        });
      });
    }
  });

  it('should prohibit batch finds with no selector', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_9');

        var unorderedBatch = col.initializeUnorderedBulkOp();
        var orderedBatch = col.initializeOrderedBulkOp();

        try {
          unorderedBatch.find();
          test.ok(false);
        } catch (e) {
          test.equal('MongoError: Bulk find operation must specify a selector', e.toString());
        }

        try {
          orderedBatch.find();
          test.ok(false);
        } catch (e) {
          test.equal('MongoError: Bulk find operation must specify a selector', e.toString());
        }

        client.close();
        done();
      });
    }
  });

  it('should return an error when no operations in unordered batch', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_8');

        col
          .initializeUnorderedBulkOp()
          .execute(self.configuration.writeConcernMax(), function(err) {
            test.equal(err instanceof Error, true);
            test.equal(err.message, 'Invalid Operation, no operations specified');

            client.close();
            done();
          });
      });
    }
  });

  it('should correctly execute unordered batch using w:0', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_9');
        var bulk = col.initializeUnorderedBulkOp();
        for (var i = 0; i < 100; i++) {
          bulk.insert({ a: 1 });
        }

        bulk
          .find({ b: 1 })
          .upsert()
          .update({ b: 1 });
        bulk.find({ c: 1 }).remove();

        bulk.execute({ w: 0 }, function(err, result) {
          test.equal(null, err);
          test.equal(0, result.nUpserted);
          test.equal(0, result.nInserted);
          test.equal(0, result.nMatched);
          test.ok(0 === result.nModified || result.nModified == null);
          test.equal(0, result.nRemoved);
          test.equal(false, result.hasWriteErrors());

          client.close();
          done();
        });
      });
    }
  });

  /*******************************************************************
   *
   * Ordered
   *
   *******************************************************************/
  it('should fail with w:2 and wtimeout write concern due single mongod instance ordered', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_concerns_ops_1');
        var batch = col.initializeOrderedBulkOp();
        batch.insert({ a: 1 });
        batch.insert({ a: 2 });

        batch.execute({ w: 2, wtimeout: 1000 }, function(err) {
          test.ok(err != null);
          test.ok(err.code != null);
          test.ok(err.errmsg != null);

          client.close();
          done();
        });
      });
    }
  });

  it('should correctly handle bulk operation split for ordered bulk operation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=2.6.0',
        topology: 'single',
        node: '>0.10.0'
      }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var docs = [];
        for (var i = 0; i < 5; i++) {
          docs.push({
            s: new Array(6000000).join('x')
          });
        }

        db.collection('bigdocs_ordered').insertMany(docs, function(err) {
          test.equal(null, err);

          db.collection('bigdocs_ordered').count(function(err, c) {
            test.equal(null, err);
            test.equal(5, c);

            client.close();
            done();
          });
        });
      });
    }
  });

  /*******************************************************************
   *
   * Unordered
   *
   *******************************************************************/
  it('should fail with w:2 and wtimeout write concern due single mongod instance unordered', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_concerns_ops_1');
        var batch = col.initializeUnorderedBulkOp();
        batch.insert({ a: 1 });
        batch.insert({ a: 2 });

        batch.execute({ w: 2, wtimeout: 1000 }, function(err) {
          test.ok(err != null);
          test.ok(err.code != null);
          test.ok(err.errmsg != null);

          client.close();
          done();
        });
      });
    }
  });

  it('should correctly return the number of operations in the bulk', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_concerns_ops_1');
        var batch = col.initializeOrderedBulkOp();
        batch.insert({ a: 1 });
        batch
          .find({})
          .upsert()
          .update({ $set: { b: 1 } });
        test.equal(2, batch.length);

        batch = col.initializeUnorderedBulkOp();
        batch.insert({ a: 1 });
        batch
          .find({})
          .upsert()
          .update({ $set: { b: 1 } });
        test.equal(2, batch.length);

        client.close();
        done();
      });
    }
  });

  it('should correctly split unordered bulk batch', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var insertFirst = false;
        var batchSize = 1000;
        var collection = db.collection('batch_write_unordered_split_test');
        var operation = collection.initializeUnorderedBulkOp(),
          documents = [];

        for (var i = 0; i < 10000; i++) {
          var document = { name: 'bob' + i };
          documents.push(document);
          operation.insert(document);
        }

        operation.execute(function(err) {
          test.equal(null, err);

          operation = collection.initializeUnorderedBulkOp();

          if (insertFirst) {
            // if you add the inserts to the batch first, it works fine.
            insertDocuments();
            replaceDocuments();
          } else {
            // if you add the updates to the batch first, it fails with the error "insert must contain at least one document"
            replaceDocuments();
            insertDocuments();
          }

          operation.execute(function(err) {
            test.equal(null, err);

            client.close();
            done();
          });
        });

        function insertDocuments() {
          for (i = 10000; i < 10200; i++) {
            operation.insert({ name: 'bob' + i });
          }
        }

        function replaceDocuments() {
          for (var i = 0; i < batchSize; i++) {
            operation.find({ _id: documents[i]._id }).replaceOne({ name: 'joe' + i });
          }
        }
      });
    }
  });

  it('should correctly split ordered bulk batch', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var insertFirst = false;
        var batchSize = 1000;
        var collection = db.collection('batch_write_ordered_split_test');
        var operation = collection.initializeOrderedBulkOp(),
          documents = [];

        for (var i = 0; i < 10000; i++) {
          var document = { name: 'bob' + i };
          documents.push(document);
          operation.insert(document);
        }

        operation.execute(function(err) {
          test.equal(null, err);

          operation = collection.initializeOrderedBulkOp();

          if (insertFirst) {
            // if you add the inserts to the batch first, it works fine.
            insertDocuments();
            replaceDocuments();
          } else {
            // if you add the updates to the batch first, it fails with the error "insert must contain at least one document"
            replaceDocuments();
            insertDocuments();
          }

          operation.execute(function(err) {
            test.equal(null, err);

            client.close();
            done();
          });
        });

        function insertDocuments() {
          for (i = 10000; i < 10200; i++) {
            operation.insert({ name: 'bob' + i });
          }
        }

        function replaceDocuments() {
          for (var i = 0; i < batchSize; i++) {
            operation.find({ _id: documents[i]._id }).replaceOne({ name: 'joe' + i });
          }
        }
      });
    }
  });

  it('should correctly handle bulk operation split for unordered bulk operation', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=2.6.0',
        topology: 'single',
        node: '>0.10.0'
      }
    },

    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        var docs = [];
        for (var i = 0; i < 5; i++) {
          docs.push({
            s: new Array(6000000).join('x')
          });
        }

        db.collection('bigdocs_unordered').insertMany(docs, { ordered: false }, function(err) {
          test.equal(null, err);

          db.collection('bigdocs_unordered').count(function(err, c) {
            test.equal(null, err);
            test.equal(5, c);

            client.close();
            done();
          });
        });
      });
    }
  });

  it(
    'should return an error instead of throwing when no operations are provided for ordered bulk operation execute',
    {
      metadata: { requires: { mongodb: '>=2.6.0', topology: 'single', node: '>0.10.0' } },
      test: function(done) {
        var self = this;
        var client = self.configuration.newClient({ w: 1 }, { poolSize: 1 });
        client.connect(function(err, client) {
          var db = client.db(self.configuration.db);
          db.collection('doesnt_matter').insertMany([], function(err) {
            test.equal(err instanceof Error, true);
            test.equal(err.message, 'Invalid Operation, no operations specified');
            client.close();
            done();
          });
        });
      }
    }
  );

  it(
    'should return an error instead of throwing when no operations are provided for unordered bulk operation execute',
    {
      metadata: { requires: { mongodb: '>=2.6.0', topology: 'single', node: '>0.10.0' } },
      test: function(done) {
        var self = this;
        var client = self.configuration.newClient({ w: 1 }, { poolSize: 1 });

        client.connect(function(err, client) {
          var db = client.db(self.configuration.db);
          db.collection('doesnt_matter').insertMany([], { ordered: false }, function(err) {
            test.equal(err instanceof Error, true);
            test.equal(err.message, 'Invalid Operation, no operations specified');
            client.close();
            done();
          });
        });
      }
    }
  );

  it(
    'should return an error instead of throwing when an empty bulk operation is submitted (with promise)',
    {
      metadata: { requires: { promises: true, node: '>0.12.0' } },
      test: function() {
        var self = this;
        var client = self.configuration.newClient({ w: 1 }, { poolSize: 1 });

        return client
          .connect()
          .then(function() {
            var db = client.db(self.configuration.db);
            return db.collection('doesnt_matter').insertMany([]);
          })
          .then(function() {
            test.equal(false, true); // this should not happen!
          })
          .catch(function(err) {
            test.equal(err instanceof Error, true);
            test.equal(err.message, 'Invalid Operation, no operations specified');
          })
          .then(function() {
            client.close();
          });
      }
    }
  );
});

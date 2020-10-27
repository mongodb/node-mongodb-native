'use strict';
const { withClient } = require('./shared');
const test = require('./shared').assert,
  setupDatabase = require('./shared').setupDatabase,
  expect = require('chai').expect;

const MongoError = require('../../src/error').MongoError;
const ignoreNsNotFound = require('./shared').ignoreNsNotFound;
const { Long } = require('../../src');

describe('Bulk', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly handle ordered single batch api write command error', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_10');

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, function (err) {
          expect(err).to.not.exist;

          var batch = col.initializeOrderedBulkOp();
          batch.insert({ b: 1, a: 1 });
          batch
            .find({ b: 2 })
            .upsert()
            .updateOne({ $set: { a: 1 } });
          batch.insert({ b: 3, a: 2 });

          batch.execute(function (err, result) {
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
            expect(error).to.not.exist;

            // Finish up test
            client.close(done);
          });
        });
      });
    }
  });

  it('should use arrayFilters for updateMany', {
    metadata: { requires: { mongodb: '>=3.6.x' } },
    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient({}, { w: 1 });

      client.connect((err, client) => {
        const db = client.db(configuration.db);
        const collection = db.collection('arrayfilterstest');
        const docs = [{ a: [{ x: 1 }, { x: 2 }] }, { a: [{ x: 3 }, { x: 4 }] }];
        const close = e => client.close(() => done(e));
        collection.insertMany(docs).then(() =>
          collection.updateMany(
            {},
            { $set: { 'a.$[i].x': 5 } },
            { arrayFilters: [{ 'i.x': 5 }] },
            (err, data) => {
              expect(err).to.not.exist;
              expect(data.matchedCount).to.equal(2);
              close(err);
            }
          )
        );
      });
    }
  });

  it('should ignore undefined values in unordered bulk operation if `ignoreUndefined` specified', {
    metadata: {
      requires: { topology: ['single'] }
    },

    test: function () {
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

    test: function () {
      var client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        poolSize: 1
      });

      return client.connect().then(client => {
        var db = client.db(this.configuration.db);
        var col = db.collection('batch_write_ordered_ops_3');

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

  it('should inherit promote long false from db during unordered bulk operation', function () {
    const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      promoteLongs: true
    });

    return withClient.call(this, client, (client, done) => {
      const db = client.db('shouldInheritPromoteLongFalseFromDb1', { promoteLongs: false });
      const coll = db.collection('test');

      const batch = coll.initializeUnorderedBulkOp();
      batch.insert({ a: Long.fromNumber(10) });
      batch.execute((err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;

        coll.findOne((err, item) => {
          expect(err).to.not.exist;
          expect(item.a).to.not.be.a('number');
          expect(item.a).to.have.property('_bsontype');
          expect(item.a._bsontype).to.be.equal('Long');

          done();
        });
      });
    });
  });

  it(
    'should inherit promote long false from collection during unordered bulk operation',
    withClient(function (client, done) {
      const db = client.db('shouldInheritPromoteLongFalseFromColl1', { promoteLongs: true });
      const coll = db.collection('test', { promoteLongs: false });

      const batch = coll.initializeUnorderedBulkOp();
      batch.insert({ a: Long.fromNumber(10) });
      batch.execute((err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;

        coll.findOne((err, item) => {
          expect(err).to.not.exist;
          expect(item.a).to.not.be.a('number');
          expect(item.a).to.have.property('_bsontype');
          expect(item.a._bsontype).to.be.equal('Long');

          done();
        });
      });
    })
  );

  it('should inherit promote long false from db during ordered bulk operation', function () {
    const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
      promoteLongs: true
    });

    return withClient.call(this, client, (client, done) => {
      const db = client.db('shouldInheritPromoteLongFalseFromDb2', { promoteLongs: false });
      const coll = db.collection('test');

      const batch = coll.initializeOrderedBulkOp();
      batch.insert({ a: Long.fromNumber(10) });
      batch.execute((err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;

        coll.findOne((err, item) => {
          expect(err).to.not.exist;
          expect(item.a).to.not.be.a('number');
          expect(item.a).to.have.property('_bsontype');
          expect(item.a._bsontype).to.be.equal('Long');

          done();
        });
      });
    });
  });

  it(
    'should inherit promote long false from collection during ordered bulk operation',
    withClient(function (client, done) {
      const db = client.db('shouldInheritPromoteLongFalseFromColl2', { promoteLongs: true });
      const coll = db.collection('test', { promoteLongs: false });

      const batch = coll.initializeOrderedBulkOp();
      batch.insert({ a: Long.fromNumber(10) });
      batch.execute((err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;

        coll.findOne((err, item) => {
          expect(err).to.not.exist;
          expect(item.a).to.not.be.a('number');
          expect(item.a).to.have.property('_bsontype');
          expect(item.a._bsontype).to.be.equal('Long');

          done();
        });
      });
    })
  );

  it('should correctly handle ordered multiple batch api write command errors', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_2');

        // Add unique index on field `a` causing all updates to fail
        col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, function (err) {
          expect(err).to.not.exist;

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

          batch.execute(function (err, result) {
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
            client.close(done);
          });
        });
      });
    }
  });

  it('should fail due to ordered document being to big', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
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
        client.close(done);
      });
    }
  });

  it('should correctly split up ordered messages into more batches', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
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
        batch.execute(function (err, result) {
          // Basic properties check
          test.equal(6, result.nInserted);
          test.equal(false, result.hasWriteErrors());

          // Finish up test
          client.close(done);
        });
      });
    }
  });

  it(
    'should Correctly Execute Ordered Batch of Write Operations with duplicate key errors on updates',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function (done) {
        var self = this;
        var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect(function (err, client) {
          var db = client.db(self.configuration.db);
          var col = db.collection('batch_write_ordered_ops_6');

          // Add unique index on b field causing all updates to fail
          col.ensureIndex({ b: 1 }, { unique: true, sparse: false }, function (err) {
            expect(err).to.not.exist;

            var batch = col.initializeOrderedBulkOp();

            // Add some operations to be executed in order
            batch.insert({ a: 1 });
            batch.find({ a: 1 }).update({ $set: { b: 1 } });
            batch.insert({ b: 1 });

            // Execute the operations
            batch.execute(function (err, result) {
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

              client.close(done);
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

      test: function (done) {
        var self = this;
        var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect(function (err, client) {
          var db = client.db(self.configuration.db);
          var col = db.collection('batch_write_ordered_ops_7');

          // Add unique index on b field causing all updates to fail
          col.ensureIndex({ b: 1 }, { unique: true, sparse: false }, function (err) {
            expect(err).to.not.exist;

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
            batch.execute(function (err, result) {
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

              client.close(done);
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

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_8');
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch
          .find({ _id: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });

        // Execute the operations
        batch.execute(function (err, result) {
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
          client.close(done);
        });
      });
    }
  });

  it('should return an error when no operations in ordered batch', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_8');

        col.initializeOrderedBulkOp().execute(function (err) {
          test.equal(err instanceof Error, true);
          test.equal(err.message, 'Invalid Operation, no operations specified');

          client.close(done);
        });
      });
    }
  });

  it('should correctly execute ordered batch using w:0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_9');

        var bulk = col.initializeOrderedBulkOp();
        for (var i = 0; i < 100; i++) {
          bulk.insert({ a: 1 });
        }

        bulk.find({ b: 1 }).upsert().update({ b: 1 });
        bulk.find({ c: 1 }).remove();

        bulk.execute({ w: 0 }, function (err, result) {
          expect(err).to.not.exist;
          test.equal(0, result.nUpserted);
          test.equal(0, result.nInserted);
          test.equal(0, result.nMatched);
          test.ok(0 === result.nModified || result.nModified == null);
          test.equal(0, result.nRemoved);
          test.equal(false, result.hasWriteErrors());

          client.close(done);
        });
      });
    }
  });

  it('should correctly handle single unordered batch API', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_1');

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, function (err) {
          expect(err).to.not.exist;

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
          batch.execute(function (err, result) {
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
            expect(error).to.not.exist;

            // Finish up test
            client.close(done);
          });
        });
      });
    }
  });

  it('should correctly handle multiple unordered batch API', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      poolSize: 1
    });

    client.connect((err, client) => {
      const db = client.db(configuration.db);
      const col = db.collection('batch_write_unordered_ops_legacy_2');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({ a: 1 }, { unique: true, sparse: false }, err => {
        expect(err).to.not.exist;

        // Initialize the unordered Batch
        const batch = col.initializeUnorderedBulkOp({ useLegacyOps: true });

        // Add some operations to be executed in order
        batch.insert({ b: 1, a: 1 });
        batch.insert({ b: 5, a: 1 });

        // Execute the operations
        batch.execute((err, result) => {
          expect(err).to.exist;
          expect(result).to.not.exist;

          // Basic properties check
          result = err.result;
          expect(result.nInserted).to.equal(1);
          expect(result.hasWriteErrors()).to.equal(true);
          expect(result.getWriteErrorCount()).to.equal(1);

          // Go over the error
          const error = result.getWriteErrorAt(0);
          expect(error.code).to.equal(11000);
          expect(error.errmsg).to.exist;
          expect(error.getOperation().b).to.equal(5);
          expect(error.getOperation().a).to.equal(1);

          // Finish up test
          client.close(done);
        });
      });
    });
  });

  it('should fail due to document being to big for unordered batch', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
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
        client.close(done);
      });
    }
  });

  it('should correctly split up messages into more batches for unordered batches', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
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
        batch.execute(function (err, result) {
          // Basic properties check
          test.equal(6, result.nInserted);
          test.equal(false, result.hasWriteErrors());

          // Finish up test
          client.close(done);
        });
      });
    }
  });

  it('should Correctly Execute Unordered Batch with duplicate key errors on updates', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_6');

        // Write concern
        var writeConcern = self.configuration.writeConcernMax();
        writeConcern.unique = true;
        writeConcern.sparse = false;

        // Add unique index on b field causing all updates to fail
        col.ensureIndex({ b: 1 }, writeConcern, function (err) {
          expect(err).to.not.exist;

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
          batch.execute(self.configuration.writeConcernMax(), function (err, result) {
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

            client.close(done);
          });
        });
      });
    }
  });

  it('should provide descriptive error message for unordered batch with duplicate key errors on inserts', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      poolSize: 1
    });

    client.connect((err, client) => {
      const db = client.db(configuration.db);
      const col = db.collection('err_batch_write_unordered_ops_legacy_6');

      // Add unique index on a field causing all inserts to fail
      col.createIndexes(
        [
          {
            name: 'err_batch_write_unordered_ops_legacy_6',
            key: { a: 1 },
            unique: true
          }
        ],
        err => {
          expect(err).to.not.exist;

          // Initialize the unordered Batch
          const batch = col.initializeUnorderedBulkOp();

          // Add some operations to be executed in order
          batch.insert({ a: 1 });
          batch.insert({ a: 1 });

          // Execute the operations
          batch.execute(configuration.writeConcernMax(), (err, result) => {
            expect(err).to.exist;
            expect(result).to.not.exist;

            // Test basic settings
            result = err.result;
            expect(result.nInserted).to.equal(1);
            expect(result.hasWriteErrors()).to.equal(true);
            expect(result.getWriteErrorCount() === 1).to.equal(true);

            // Individual error checking
            const error = result.getWriteErrorAt(0);
            expect(error.code === 11000).to.equal(true);
            expect(error.errmsg).to.exist;
            expect(err.message).to.equal(error.errmsg);

            client.close(done);
          });
        }
      );
    });
  });

  it(
    'should Correctly Execute Unordered Batch of with upserts causing duplicate key errors on updates',
    {
      metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

      test: function (done) {
        var self = this;
        var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
          poolSize: 1
        });

        client.connect(function (err, client) {
          var db = client.db(self.configuration.db);
          var col = db.collection('batch_write_unordered_ops_legacy_7');

          // Add unique index on b field causing all updates to fail
          col.ensureIndex({ b: 1 }, { unique: true, sparse: false }, function (err) {
            expect(err).to.not.exist;

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
            batch.execute(self.configuration.writeConcernMax(), function (err, result) {
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

              client.close(done);
            });
          });
        });
      }
    }
  );

  it('should correctly perform unordered upsert with custom _id', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_8');
        var batch = col.initializeUnorderedBulkOp();

        // Add some operations to be executed in order
        batch
          .find({ _id: 2 })
          .upsert()
          .updateOne({ $set: { b: 2 } });

        // Execute the operations
        batch.execute(self.configuration.writeConcernMax(), function (err, result) {
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
          client.close(done);
        });
      });
    }
  });

  it('should prohibit batch finds with no selector', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_unordered_ops_legacy_9');

        var unorderedBatch = col.initializeUnorderedBulkOp();
        var orderedBatch = col.initializeOrderedBulkOp();

        try {
          unorderedBatch.find();
          test.ok(false);
        } catch (e) {
          expect(e).to.match(/Bulk find operation must specify a selector/);
        }

        try {
          orderedBatch.find();
          test.ok(false);
        } catch (e) {
          expect(e).to.match(/Bulk find operation must specify a selector/);
        }

        client.close(done);
      });
    }
  });

  it('should return an error when no operations in unordered batch', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_8');

        col
          .initializeUnorderedBulkOp()
          .execute(self.configuration.writeConcernMax(), function (err) {
            test.equal(err instanceof Error, true);
            test.equal(err.message, 'Invalid Operation, no operations specified');

            client.close(done);
          });
      });
    }
  });

  it('should correctly execute unordered batch using w:0', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_ordered_ops_9');
        var bulk = col.initializeUnorderedBulkOp();
        for (var i = 0; i < 100; i++) {
          bulk.insert({ a: 1 });
        }

        bulk.find({ b: 1 }).upsert().update({ b: 1 });
        bulk.find({ c: 1 }).remove();

        bulk.execute({ w: 0 }, function (err, result) {
          expect(err).to.not.exist;
          test.equal(0, result.nUpserted);
          test.equal(0, result.nInserted);
          test.equal(0, result.nMatched);
          test.ok(0 === result.nModified || result.nModified == null);
          test.equal(0, result.nRemoved);
          test.equal(false, result.hasWriteErrors());

          client.close(done);
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

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_concerns_ops_1');
        var batch = col.initializeOrderedBulkOp();
        batch.insert({ a: 1 });
        batch.insert({ a: 2 });

        batch.execute({ w: 2, wtimeout: 1000 }, function (err) {
          test.ok(err != null);
          test.ok(err.code != null);
          test.ok(err.errmsg != null);

          client.close(done);
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
        topology: 'single'
      }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var docs = [];
        for (var i = 0; i < 5; i++) {
          docs.push({
            s: new Array(6000000).join('x')
          });
        }

        db.collection('bigdocs_ordered').insertMany(docs, function (err) {
          expect(err).to.not.exist;

          db.collection('bigdocs_ordered').count(function (err, c) {
            expect(err).to.not.exist;
            test.equal(5, c);

            client.close(done);
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

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var col = db.collection('batch_write_concerns_ops_1');
        var batch = col.initializeUnorderedBulkOp();
        batch.insert({ a: 1 });
        batch.insert({ a: 2 });

        batch.execute({ w: 2, wtimeout: 1000 }, function (err) {
          test.ok(err != null);
          test.ok(err.code != null);
          test.ok(err.errmsg != null);

          client.close(done);
        });
      });
    }
  });

  it('should correctly return the number of operations in the bulk', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
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

        client.close(done);
      });
    }
  });

  it('should correctly split unordered bulk batch', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
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

        operation.execute(function (err) {
          expect(err).to.not.exist;

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

          operation.execute(function (err) {
            expect(err).to.not.exist;

            client.close(done);
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

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
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

        operation.execute(function (err) {
          expect(err).to.not.exist;

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

          operation.execute(function (err) {
            expect(err).to.not.exist;

            client.close(done);
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
        topology: 'single'
      }
    },

    test: function (done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        var db = client.db(self.configuration.db);
        var docs = [];
        for (var i = 0; i < 5; i++) {
          docs.push({
            s: new Array(6000000).join('x')
          });
        }

        db.collection('bigdocs_unordered').insertMany(docs, { ordered: false }, function (err) {
          expect(err).to.not.exist;

          db.collection('bigdocs_unordered').count(function (err, c) {
            expect(err).to.not.exist;
            test.equal(5, c);

            client.close(done);
          });
        });
      });
    }
  });

  it(
    'should return an error instead of throwing when no operations are provided for ordered bulk operation execute',
    {
      metadata: { requires: { mongodb: '>=2.6.0', topology: 'single' } },
      test: function (done) {
        var self = this;
        var client = self.configuration.newClient({ w: 1 }, { poolSize: 1 });
        client.connect(function (err, client) {
          var db = client.db(self.configuration.db);
          db.collection('doesnt_matter').insertMany([], function (err) {
            test.equal(err instanceof Error, true);
            test.equal(err.message, 'Invalid Operation, no operations specified');
            client.close(done);
          });
        });
      }
    }
  );

  it(
    'should return an error instead of throwing when no operations are provided for unordered bulk operation execute',
    {
      metadata: { requires: { mongodb: '>=2.6.0', topology: 'single' } },
      test: function (done) {
        var self = this;
        var client = self.configuration.newClient({ w: 1 }, { poolSize: 1 });

        client.connect(function (err, client) {
          var db = client.db(self.configuration.db);
          db.collection('doesnt_matter').insertMany([], { ordered: false }, function (err) {
            test.equal(err instanceof Error, true);
            test.equal(err.message, 'Invalid Operation, no operations specified');
            client.close(done);
          });
        });
      }
    }
  );

  it('should return an error instead of throwing when an empty bulk operation is submitted (with promise)', function () {
    var self = this;
    var client = self.configuration.newClient({ w: 1 }, { poolSize: 1 });

    return client
      .connect()
      .then(function () {
        var db = client.db(self.configuration.db);
        return db.collection('doesnt_matter').insertMany([]);
      })
      .then(function () {
        test.equal(false, true); // this should not happen!
      })
      .catch(function (err) {
        test.equal(err instanceof Error, true);
        test.equal(err.message, 'Invalid Operation, no operations specified');
      })
      .then(function () {
        return client.close();
      });
  });

  it('should properly account for array key size in bulk unordered inserts', function (done) {
    const client = this.configuration.newClient();
    const documents = new Array(20000).fill('').map(() => ({
      arr: new Array(19).fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    }));

    let db;

    client
      .connect()
      // NOTE: Hack to get around unrelated strange error in bulkWrites for right now.
      .then(() => {
        db = client.db(this.configuration.db);
        return db.dropCollection('doesnt_matter').catch(() => {});
      })
      .then(() => {
        return db.createCollection('doesnt_matter');
      })
      .then(() => {
        const coll = db.collection('doesnt_matter');

        coll.insertMany(documents, { ordered: false }, err => {
          client.close(() => {
            done(err);
          });
        });
      });
  });

  it('should properly account for array key size in bulk ordered inserts', function (done) {
    const client = this.configuration.newClient();
    const documents = new Array(20000).fill('').map(() => ({
      arr: new Array(19).fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    }));

    let db;

    client
      .connect()
      // NOTE: Hack to get around unrelated strange error in bulkWrites for right now.
      .then(() => {
        db = client.db(this.configuration.db);
        return db.dropCollection('doesnt_matter').catch(() => {});
      })
      .then(() => {
        return db.createCollection('doesnt_matter');
      })
      .then(() => {
        const coll = db.collection('doesnt_matter');

        coll.insertMany(documents, { ordered: true }, err => {
          client.close(() => {
            done(err);
          });
        });
      });
  });

  function testPropagationOfBulkWriteError(bulk) {
    return bulk.execute().then(
      err => {
        expect(err).to.be.an.instanceOf(MongoError);
      },
      err => {
        expect(err).to.be.an.instanceOf(TypeError);
      }
    );
  }

  it('should propagate the proper error from executing an empty ordered batch', function () {
    const client = this.configuration.newClient();

    return client
      .connect()
      .then(() => {
        const collection = client.db(this.configuration.db).collection('doesnt_matter');

        return testPropagationOfBulkWriteError(collection.initializeOrderedBulkOp());
      })
      .then(() => client.close());
  });

  it('should propagate the proper error from executing an empty unordered batch', function () {
    const client = this.configuration.newClient();

    return client
      .connect()
      .then(() => {
        const collection = client.db(this.configuration.db).collection('doesnt_matter');

        return testPropagationOfBulkWriteError(collection.initializeUnorderedBulkOp());
      })
      .then(() => client.close());
  });

  it('should promote a single error to the top-level message, and preserve writeErrors', function () {
    const client = this.configuration.newClient();
    return client.connect().then(() => {
      this.defer(() => client.close());

      const coll = client.db().collection('single_bulk_write_error');
      return coll
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => coll.insert(Array.from({ length: 4 }, (_, i) => ({ _id: i, a: i }))))
        .then(() =>
          coll.bulkWrite([{ insertOne: { _id: 5, a: 0 } }, { insertOne: { _id: 5, a: 0 } }])
        )
        .then(
          () => {
            throw new Error('expected a bulk error');
          },
          err => {
            expect(err)
              .property('message')
              .to.match(/E11000/);
            expect(err).to.have.property('writeErrors').with.length(1);
          }
        );
    });
  });

  it('should preserve order of operation index in unordered bulkWrite', function () {
    const client = this.configuration.newClient();
    return client.connect().then(() => {
      this.defer(() => client.close());

      const coll = client.db().collection('bulk_write_ordering_test');
      return coll
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => coll.insert(Array.from({ length: 4 }, (_, i) => ({ _id: i, a: i }))))
        .then(() =>
          coll
            .createIndex({ a: 1 }, { unique: true })
            .then(() =>
              coll.bulkWrite(
                [
                  { insertOne: { _id: 5, a: 0 } },
                  { updateOne: { filter: { _id: 1 }, update: { $set: { a: 15 } } } },
                  { insertOne: { _id: 6, a: 0 } },
                  { updateOne: { filter: { _id: 2 }, update: { $set: { a: 42 } } } }
                ],
                { ordered: false }
              )
            )
        )
        .then(
          () => {
            throw new Error('expected a bulk error');
          },
          err => {
            expect(err).to.have.property('writeErrors').with.length(2);

            expect(err).to.have.nested.property('writeErrors[0].err.index', 0);
            expect(err).to.have.nested.property('writeErrors[1].err.index', 2);
          }
        );
    });
  });

  it('should preserve order of operation index in unordered bulk operation', function () {
    const client = this.configuration.newClient();
    return client.connect().then(() => {
      this.defer(() => client.close());

      const coll = client.db().collection('unordered_preserve_order');
      return coll
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => {
          const batch = coll.initializeUnorderedBulkOp();
          batch.insert({ _id: 1, a: 0 });
          batch.insert({ _id: 1, a: 0 });
          batch.insert({ _id: 2, a: 0 });
          batch.insert({ _id: 2, a: 0 });
          return batch.execute();
        })
        .then(
          () => {
            throw new Error('expected a bulk error');
          },
          err => {
            expect(err).to.have.property('writeErrors').with.length(2);

            expect(err).to.have.nested.property('writeErrors[0].err.index', 1);
            expect(err).to.have.nested.property('writeErrors[1].err.index', 3);
          }
        );
    });
  });

  it('should not fail on the first error in an unorderd bulkWrite', function () {
    const client = this.configuration.newClient();
    return client.connect().then(() => {
      this.defer(() => client.close());

      const coll = client.db().collection('bulk_op_ordering_test');
      return coll
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => coll.createIndex({ email: 1 }, { unique: 1, background: false }))
        .then(() =>
          Promise.all([
            coll.updateOne(
              { email: 'adam@gmail.com' },
              { $set: { name: 'Adam Smith', age: 29 } },
              { upsert: true }
            ),
            coll.updateOne(
              { email: 'john@gmail.com' },
              { $set: { name: 'John Doe', age: 32 } },
              { upsert: true }
            )
          ])
        )
        .then(() =>
          coll.bulkWrite(
            [
              {
                updateOne: {
                  filter: { email: 'adam@gmail.com' },
                  update: { $set: { age: 39 } }
                }
              },
              {
                insertOne: {
                  document: {
                    email: 'john@gmail.com'
                  }
                }
              }
            ],
            { ordered: false }
          )
        )
        .then(
          () => {
            throw new Error('expected a bulk error');
          },
          err => expect(err).property('code').to.equal(11000)
        )
        .then(() => coll.findOne({ email: 'adam@gmail.com' }))
        .then(updatedAdam => expect(updatedAdam).property('age').to.equal(39));
    });
  });
});

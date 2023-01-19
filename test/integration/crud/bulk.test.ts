import { expect } from 'chai';
import * as crypto from 'crypto';

import {
  Collection,
  Long,
  MongoBatchReExecutionError,
  MongoClient,
  MongoDriverError,
  MongoInvalidArgumentError
} from '../../mongodb';
import { assert as test, ignoreNsNotFound } from '../shared';

const MAX_BSON_SIZE = 16777216;
const DB_NAME = 'bulk_operations_tests';

describe('Bulk', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient({}, { maxPoolSize: 1, monitorCommands: true });

    client.s.options.dbName = DB_NAME; // make default for client.db() calls
    await client
      .db(DB_NAME)
      .dropDatabase()
      .catch(() => null); // clear out ns

    await client
      .db(DB_NAME)
      .createCollection('test')
      .catch(() => null); // make ns exist
  });

  afterEach(async function () {
    const cleanup = this.configuration.newClient();
    await cleanup
      .db(DB_NAME)
      .dropDatabase()
      .catch(() => null);
    await cleanup.close();

    await client?.close();
    client = null;
  });

  describe('BulkOperationBase', () => {
    describe('#raw()', function () {
      context('when called with an undefined operation', function () {
        it('should throw a MongoInvalidArgument error ', async function () {
          const bulkOp = client.db('test').collection('test').initializeUnorderedBulkOp();
          expect(() => bulkOp.raw(undefined)).to.throw(MongoInvalidArgumentError);
          expect(() => bulkOp.raw(true)).to.throw(MongoInvalidArgumentError);
          expect(() => bulkOp.raw(3)).to.throw(MongoInvalidArgumentError);
        });

        it('should throw an error with the specifc message: "Operation must be an object with an operation key"', async function () {
          const bulkOp = client.db('test').collection('test').initializeUnorderedBulkOp();
          expect(() => bulkOp.raw(undefined))
            .to.throw(MongoInvalidArgumentError)
            .to.match(/Operation must be an object with an operation key/);
        });
      });

      context('when called with a valid operation', function () {
        it('should not throw a MongoInvalidArgument error', async function () {
          try {
            client.db('test').collection('test').initializeUnorderedBulkOp().raw({ insertOne: {} });
          } catch (error) {
            expect(error).not.to.exist;
          }
        });
      });
    });
  });

  describe('Collection', function () {
    describe('#insertMany()', function () {
      context('when passed an invalid docs argument', function () {
        it('should throw a MongoInvalidArgument error', async function () {
          try {
            const docs = [];
            docs[1] = { color: 'red' };
            await client.db('test').collection('test').insertMany(docs);
            expect.fail('Expected insertMany to throw error, failed to throw error');
          } catch (error) {
            expect(error).to.be.instanceOf(MongoInvalidArgumentError);
            expect(error.message).to.equal(
              'Collection.insertMany() cannot be called with an array that has null/undefined values'
            );
          }
        });
      });
      context('when passed a valid document list', function () {
        it('insertMany should not throw a MongoInvalidArgument error when called with a valid operation', async function () {
          try {
            const result = await client
              .db('test')
              .collection('test')
              .insertMany([{ color: 'blue' }]);
            expect(result).to.exist;
          } catch (error) {
            expect(error).not.to.exist;
          }
        });
      });
    });
  });

  it('Should correctly execute unordered bulk operation', async function () {
    const db = client.db();
    const bulk = db
      .collection('unordered_bulk_promise_form')
      .initializeUnorderedBulkOp({ writeConcern: { w: 1 } });
    bulk.insert({ a: 1 });

    const r = await bulk.execute();
    test.ok(r);
    test.deepEqual({ w: 1 }, bulk.s.writeConcern);
  });

  it('Should correctly execute ordered bulk operation', async function () {
    const db = client.db();
    const bulk = db
      .collection('unordered_bulk_promise_form')
      .initializeOrderedBulkOp({ writeConcern: { w: 1 } });
    bulk.insert({ a: 1 });

    const r = await bulk.execute();
    test.ok(r);
    test.deepEqual({ w: 1 }, bulk.s.writeConcern);
  });

  it('Should correctly handle bulkWrite with no options', async function () {
    const db = client.db();
    const col = db.collection('find_one_and_replace_with_promise_no_option');
    const result = await col.bulkWrite([{ insertOne: { document: { a: 1 } } }]);
    expect(result).to.exist;
  });

  it('should correctly handle ordered single batch api write command error', function (done) {
    const db = client.db();
    const col = db.collection('batch_write_ordered_ops_10');

    // Add unique index on b field causing all updates to fail
    col.createIndex({ a: 1 }, { unique: true, sparse: false }, err => {
      expect(err).to.not.exist;

      const batch = col.initializeOrderedBulkOp();
      batch.insert({ b: 1, a: 1 });
      batch
        .find({ b: 2 })
        .upsert()
        .updateOne({ $set: { a: 1 } });
      batch.insert({ b: 3, a: 2 });

      batch.execute((err, result) => {
        expect(err).to.exist;
        expect(result).to.not.exist;

        result = err.result;

        // Basic properties check
        test.equal(1, result.nInserted);
        test.equal(true, result.hasWriteErrors());
        test.equal(1, result.getWriteErrorCount());

        // Get the write error
        let error = result.getWriteErrorAt(0);
        test.equal(11000, error.code);
        test.ok(error.errmsg != null);

        // Get the operation that caused the error
        const op = error.getOperation();
        test.equal(2, op.q.b);
        test.equal(1, op.u['$set'].a);
        expect(op.multi).to.not.be.true;
        test.equal(true, op.upsert);

        // Get the first error
        error = result.getWriteErrorAt(1);
        expect(error).to.not.exist;

        // Finish up test
        client.close(done);
      });
    });
  });

  it('should use arrayFilters for updateMany', {
    metadata: { requires: { mongodb: '>=3.6.x' } },
    async test() {
      const db = client.db();
      const collection = db.collection<{ a: { x: number }[] }>('arrayfilterstest');
      const docs = [{ a: [{ x: 1 }, { x: 2 }] }, { a: [{ x: 3 }, { x: 4 }] }];
      await collection
        .insertMany(docs)
        .then(() =>
          collection.updateMany({}, { $set: { 'a.$[i].x': 5 } }, { arrayFilters: [{ 'i.x': 5 }] })
        )
        .then(data => {
          expect(data.matchedCount).to.equal(2);
        });
    }
  });

  it('should ignore undefined values in unordered bulk operation if `ignoreUndefined` specified', async function () {
    const db = client.db();
    const col = db.collection('batch_write_unordered_ops_1');

    await col
      .initializeUnorderedBulkOp({ ignoreUndefined: true })
      .insert({ a: 1, b: undefined })
      .execute();

    const docs = await col.find({}).toArray();
    expect(docs[0]['a']).to.equal(1);
    expect(docs[0]['b']).to.not.exist;
  });

  it('should ignore undefined values in ordered bulk operation if `ignoreUndefined` specified', async function () {
    const db = client.db();
    const col = db.collection('batch_write_ordered_ops_3');

    await col
      .initializeOrderedBulkOp({ ignoreUndefined: true })
      .insert({ a: 1, b: undefined })
      .execute();

    const docs = await col.find({}).toArray();

    expect(docs[0]['a']).to.equal(1);
    expect(docs[0]['b']).to.not.exist;
  });

  it('should inherit promote long false from db during unordered bulk operation', async function () {
    const db = client.db('shouldInheritPromoteLongFalseFromDb1', { promoteLongs: false });
    const coll = db.collection<{ a: Long }>('test');

    const batch = coll.initializeUnorderedBulkOp();
    batch.insert({ a: Long.fromNumber(10) });
    const result = await batch.execute();
    expect(result).to.exist;

    const item = await coll.findOne();
    expect(item.a).to.not.be.a('number');
    expect(item.a).to.have.property('_bsontype', 'Long');
  });

  it('should inherit promote long false from collection during unordered bulk operation', async function () {
    const db = client.db('shouldInheritPromoteLongFalseFromColl1', { promoteLongs: true });
    const coll = db.collection('test', { promoteLongs: false });

    const batch = coll.initializeUnorderedBulkOp();
    batch.insert({ a: Long.fromNumber(10) });

    const result = await batch.execute();
    expect(result).to.exist;

    const item = await coll.findOne();
    expect(item.a).to.not.be.a('number');
    expect(item.a).to.have.property('_bsontype', 'Long');
  });

  it('should inherit promote long false from db during ordered bulk operation', async function () {
    const db = client.db('shouldInheritPromoteLongFalseFromDb2', { promoteLongs: false });
    const coll = db.collection('test');

    const batch = coll.initializeOrderedBulkOp();
    batch.insert({ a: Long.fromNumber(10) });
    const result = await batch.execute();
    expect(result).to.exist;

    const item = await coll.findOne();
    expect(item.a).to.not.be.a('number');
    expect(item.a).to.have.property('_bsontype', 'Long');
  });

  it('should inherit promote long false from collection during ordered bulk operation', async function () {
    const db = client.db('shouldInheritPromoteLongFalseFromColl2', { promoteLongs: true });
    const coll = db.collection('test', { promoteLongs: false });

    const batch = coll.initializeOrderedBulkOp();
    batch.insert({ a: Long.fromNumber(10) });
    const result = await batch.execute();
    expect(result).to.exist;

    const item = await coll.findOne();
    expect(item.a).to.not.be.a('number');
    expect(item.a).to.have.property('_bsontype', 'Long');
  });

  it('should correctly handle ordered multiple batch api write command errors', function (done) {
    const db = client.db();
    const col = db.collection('batch_write_ordered_ops_2');

    // Add unique index on field `a` causing all updates to fail
    col.createIndex({ a: 1 }, { unique: true, sparse: false }, function (err) {
      expect(err).to.not.exist;

      const batch = col.initializeOrderedBulkOp();
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
        const error = result.getWriteErrorAt(0);
        test.equal(1, error.index);
        test.equal(11000, error.code);
        test.ok(error.errmsg != null);
        test.equal(2, error.getOperation().q.b);
        test.equal(1, error.getOperation().u['$set'].a);
        expect(error.getOperation().multi).to.not.be.true;
        test.equal(true, error.getOperation().upsert);

        // Finish up test
        client.close(done);
      });
    });
  });

  it('should fail due to ordered document being to big', () => {
    const db = client.db();
    const coll = db.collection('batch_write_ordered_ops_3');
    // Set up a giant string to blow through the max message size
    let hugeString = '';
    // Create it bigger than 16MB
    for (let i = 0; i < 1024 * 1100; i++) {
      hugeString = hugeString + '1234567890123456';
    }

    // Set up the batch
    const batch = coll.initializeOrderedBulkOp();
    batch.insert({ b: 1, a: 1 });
    // should fail on insert due to string being to big
    try {
      batch.insert({ string: hugeString });
      test.ok(false);
    } catch (err) {
      // should throw
    }
  });

  it('should correctly split up ordered messages into more batches', function (done) {
    const db = client.db();
    const coll = db.collection('batch_write_ordered_ops_4');

    // Set up a giant string to blow through the max message size
    let hugeString = '';
    // Create it bigger than 16MB
    for (let i = 0; i < 1024 * 256; i++) {
      hugeString = hugeString + '1234567890123456';
    }

    // Insert the string a couple of times, should force split into multiple batches
    const batch = coll.initializeOrderedBulkOp();
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

  it('should Correctly Execute Ordered Batch of Write Operations with duplicate key errors on updates', async function () {
    const db = client.db();
    const col = db.collection('batch_write_ordered_ops_6');
    // Add unique index on b field causing all updates to fail
    await col.createIndex({ b: 1 }, { unique: true, sparse: false });
    const batch = col.initializeOrderedBulkOp();

    // Add some operations to be executed in order
    batch.insert({ a: 1 });
    batch.find({ a: 1 }).update({ $set: { b: 1 } });
    batch.insert({ b: 1 });

    const thrownError = await batch.execute().catch(error => error);
    expect(thrownError).to.instanceOf(Error);

    // Test basic settings
    const result = thrownError.result;
    expect(result).to.have.property('nInserted', 1);
    expect(result).to.have.property('nMatched', 1);
    expect(result)
      .to.have.property('nModified')
      .that.satisfies(v => v == null || v === 1);
    expect(result).to.have.property('hasWriteErrors').that.is.a('function');
    expect(result).to.have.property('getWriteErrorCount').that.is.a('function');
    expect(result.hasWriteErrors()).to.be.true;
    expect(result.getWriteErrorCount()).to.equal(1);

    // Individual error checking
    const writeError = result.getWriteErrorAt(0);
    expect(writeError).to.have.property('index', 2);
    expect(writeError).to.have.property('code', 11000);
    expect(writeError).to.have.property('errmsg').that.is.a('string');
    expect(writeError.getOperation()).to.have.property('b', 1);
  });

  it('should Correctly Execute Ordered Batch of Write Operations with upserts causing duplicate key errors on updates', async function () {
    const db = client.db();
    const col = db.collection('batch_write_ordered_ops_7');

    // Add unique index on b field causing all updates to fail
    await col.createIndex({ b: 1 }, { unique: true, sparse: false });

    const batch = col.initializeOrderedBulkOp();
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
    const originalError = await batch.execute().catch(error => error);

    // Test basic settings
    const result = originalError.result;
    test.equal(1, result.nInserted);
    test.equal(2, result.nUpserted);
    test.equal(1, result.nMatched);
    test.ok(1 === result.nModified || result.nModified == null);
    test.equal(true, result.hasWriteErrors());
    test.equal(1, result.getWriteErrorCount());

    // Individual error checking
    const error = result.getWriteErrorAt(0);
    test.equal(4, error.index);
    test.equal(11000, error.code);
    test.ok(error.errmsg != null);
    test.equal(1, error.getOperation().b);

    // Check for upserted values
    const ids = result.getUpsertedIds();
    test.equal(2, ids.length);
    test.equal(2, ids[0].index);
    test.ok(ids[0]._id != null);
    test.equal(3, ids[1].index);
    test.ok(ids[1]._id != null);
  });

  it('should correctly perform ordered upsert with custom _id', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      client.connect((err, client) => {
        const db = client.db();
        const col = db.collection('batch_write_ordered_ops_8');
        const batch = col.initializeOrderedBulkOp();

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

          const upserts = result.getUpsertedIds();
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
      client.connect((err, client) => {
        const db = client.db();
        const col = db.collection('batch_write_ordered_ops_8');

        col.initializeOrderedBulkOp().execute(function (err) {
          expect(err).to.be.instanceOf(MongoDriverError);
          expect(err).to.have.property('message', 'Invalid BulkOperation, Batch cannot be empty');

          client.close(done);
        });
      });
    }
  });

  it('should correctly execute ordered batch using w:0', function (done) {
    client.connect((err, client) => {
      const db = client.db();
      const col = db.collection('batch_write_ordered_ops_9');

      const bulk = col.initializeOrderedBulkOp();
      for (let i = 0; i < 100; i++) {
        bulk.insert({ a: 1 });
      }

      bulk.find({ b: 1 }).upsert().update({ b: 1 });
      bulk.find({ c: 1 }).delete();

      bulk.execute({ writeConcern: { w: 0 } }, function (err, result) {
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
  });

  it('should correctly handle single unordered batch API', function (done) {
    client.connect((err, client) => {
      const db = client.db();
      const col = db.collection('batch_write_unordered_ops_legacy_1');

      // Add unique index on b field causing all updates to fail
      col.createIndex({ a: 1 }, { unique: true, sparse: false }, function (err) {
        expect(err).to.not.exist;

        // Initialize the unordered Batch
        const batch = col.initializeUnorderedBulkOp();

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
          let error = result.getWriteErrorAt(0);
          test.equal(11000, error.code);
          test.ok(error.errmsg != null);

          // Get the operation that caused the error
          const op = error.getOperation();
          test.equal(2, op.q.b);
          test.equal(1, op.u['$set'].a);
          expect(op.multi).to.not.be.true;
          test.equal(true, op.upsert);

          // Get the first error
          error = result.getWriteErrorAt(1);
          expect(error).to.not.exist;

          // Finish up test
          client.close(done);
        });
      });
    });
  });

  it('should correctly handle multiple unordered batch API', function (done) {
    client.connect((err, client) => {
      const db = client.db();
      const col = db.collection('batch_write_unordered_ops_legacy_2');

      // Add unique index on b field causing all updates to fail
      col.createIndex({ a: 1 }, { unique: true, sparse: false }, err => {
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
      client.connect((err, client) => {
        const db = client.db();
        const coll = db.collection('batch_write_unordered_ops_legacy_3');
        // Set up a giant string to blow through the max message size
        let hugeString = '';
        // Create it bigger than 16MB
        for (let i = 0; i < 1024 * 1100; i++) {
          hugeString = hugeString + '1234567890123456';
        }

        // Set up the batch
        const batch = coll.initializeUnorderedBulkOp();
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
      client.connect((err, client) => {
        const db = client.db();
        const coll = db.collection('batch_write_unordered_ops_legacy_4');

        // Set up a giant string to blow through the max message size
        let hugeString = '';
        // Create it bigger than 16MB
        for (let i = 0; i < 1024 * 256; i++) {
          hugeString = hugeString + '1234567890123456';
        }

        // Insert the string a couple of times, should force split into multiple batches
        const batch = coll.initializeUnorderedBulkOp();
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

  it('should Correctly Execute Unordered Batch with duplicate key errors on updates', function (done) {
    client.connect((err, client) => {
      const db = client.db();
      const col = db.collection('batch_write_unordered_ops_legacy_6');

      // Write concern
      const writeConcern = this.configuration.writeConcernMax();
      writeConcern.unique = true;
      writeConcern.sparse = false;

      // Add unique index on b field causing all updates to fail
      col.createIndex({ b: 1 }, writeConcern, function (err) {
        expect(err).to.not.exist;

        // Initialize the unordered Batch
        const batch = col.initializeUnorderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({ a: 1 });
        batch.find({ a: 1 }).update({ $set: { b: 1 } });
        batch.insert({ b: 1 });
        batch.insert({ b: 1 });
        batch.insert({ b: 1 });
        batch.insert({ b: 1 });

        // Execute the operations
        batch.execute({}, function (err, result) {
          expect(err).to.exist;
          expect(result).to.not.exist;

          // Test basic settings
          result = err.result;
          test.equal(2, result.nInserted);
          test.equal(true, result.hasWriteErrors());
          test.ok(result.getWriteErrorCount() === 4 || result.getWriteErrorCount() === 3);

          // Individual error checking
          const error = result.getWriteErrorAt(0);
          test.ok(error.code === 11000 || error.code === 11001);
          test.ok(error.errmsg != null);

          client.close(done);
        });
      });
    });
  });

  it('should provide descriptive error message for unordered batch with duplicate key errors on inserts', function (done) {
    const configuration = this.configuration;

    client.connect((err, client) => {
      const db = client.db();
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
        client.connect((err, client) => {
          const db = client.db();
          const col = db.collection('batch_write_unordered_ops_legacy_7');

          // Add unique index on b field causing all updates to fail
          col.createIndex({ b: 1 }, { unique: true, sparse: false }, err => {
            expect(err).to.not.exist;

            // Initialize the unordered Batch
            const batch = col.initializeUnorderedBulkOp();

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
            batch.execute({}, function (err, result) {
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
              const error = result.getWriteErrorAt(0);
              test.ok(error.code === 11000 || error.code === 11001);
              test.ok(error.errmsg != null);
              test.equal(1, error.getOperation().u['$set'].b);

              // Check for upserted values
              const ids = result.getUpsertedIds();
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

  it('should correctly perform unordered upsert with custom _id', function (done) {
    client.connect((err, client) => {
      const db = client.db();
      const col = db.collection('batch_write_unordered_ops_legacy_8');
      const batch = col.initializeUnorderedBulkOp();

      // Add some operations to be executed in order
      batch
        .find({ _id: 2 })
        .upsert()
        .updateOne({ $set: { b: 2 } });

      // Execute the operations
      batch.execute({}, function (err, result) {
        // Check state of result
        test.equal(1, result.nUpserted);
        test.equal(0, result.nInserted);
        test.equal(0, result.nMatched);
        test.ok(0 === result.nModified || result.nModified == null);
        test.equal(0, result.nRemoved);

        const upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(0, upserts[0].index);
        test.equal(2, upserts[0]._id);

        // Finish up test
        client.close(done);
      });
    });
  });

  it('should prohibit batch finds with no selector', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db();
        const col = db.collection('batch_write_unordered_ops_legacy_9');

        const unorderedBatch = col.initializeUnorderedBulkOp();
        const orderedBatch = col.initializeOrderedBulkOp();

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
      client.connect((err, client) => {
        const db = client.db();
        const col = db.collection('batch_write_ordered_ops_8');

        col.initializeUnorderedBulkOp().execute({}, function (err) {
          expect(err).to.be.instanceOf(MongoDriverError);
          expect(err).to.have.property('message', 'Invalid BulkOperation, Batch cannot be empty');

          client.close(done);
        });
      });
    }
  });

  it('should correctly execute unordered batch using w:0', {
    metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },

    test: function (done) {
      client.connect((err, client) => {
        const db = client.db();
        const col = db.collection('batch_write_ordered_ops_9');
        const bulk = col.initializeUnorderedBulkOp();
        for (let i = 0; i < 100; i++) {
          bulk.insert({ a: 1 });
        }

        bulk.find({ b: 1 }).upsert().update({ b: 1 });
        bulk.find({ c: 1 }).delete();

        bulk.execute({ writeConcern: { w: 0 } }, function (err, result) {
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

  it('should provide an accessor for operations on ordered bulk ops', function (done) {
    client.connect((err, client) => {
      const db = client.db();
      const col = db.collection('bulk_get_operations_test');

      const batch = col.initializeOrderedBulkOp();
      batch.insert({ b: 1, a: 1 });
      batch
        .find({ b: 2 })
        .upsert()
        .updateOne({ $set: { a: 1 } });
      batch.insert({ b: 3, a: 2 });
      const batches = batch.batches;
      expect(batches).to.have.lengthOf(3);
      expect(batches[0].operations[0]).to.containSubset({ b: 1, a: 1 });
      expect(batches[1].operations[0]).to.containSubset({
        q: { b: 2 },
        u: { $set: { a: 1 } },
        upsert: true
      });
      expect(batches[2].operations[0]).to.containSubset({ b: 3, a: 2 });
      client.close(done);
    });
  });

  it('should fail with w:2 and wtimeout write concern due single mongod instance ordered', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function (done) {
      client.connect((err, client) => {
        const db = client.db();
        const col = db.collection('batch_write_concerns_ops_1');
        const batch = col.initializeOrderedBulkOp();
        batch.insert({ a: 1 });
        batch.insert({ a: 2 });

        batch.execute({ writeConcern: { w: 2, wtimeoutMS: 1000 } }, function (err) {
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
      client.connect((err, client) => {
        const db = client.db();
        const docs = [];
        for (let i = 0; i < 5; i++) {
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

  it('should provide an accessor for operations on unordered bulk ops', function (done) {
    client.connect((err, client) => {
      const db = client.db();
      const col = db.collection('bulk_get_operations_test');

      const batch = col.initializeUnorderedBulkOp();
      batch.insert({ b: 1, a: 1 });
      batch
        .find({ b: 2 })
        .upsert()
        .updateOne({ $set: { a: 1 } });
      batch.insert({ b: 3, a: 2 });
      const batches = batch.batches;
      expect(batches).to.have.lengthOf(2);
      expect(batches[0].operations[0]).to.containSubset({ b: 1, a: 1 });
      expect(batches[0].operations[1]).to.containSubset({ b: 3, a: 2 });
      expect(batches[1].operations[0]).to.containSubset({
        q: { b: 2 },
        u: { $set: { a: 1 } },
        upsert: true
      });
      client.close(done);
    });
  });

  it('should fail with w:2 and wtimeout write concern due single mongod instance unordered', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function (done) {
      client.connect((err, client) => {
        const db = client.db();
        const col = db.collection('batch_write_concerns_ops_1');
        const batch = col.initializeUnorderedBulkOp();
        batch.insert({ a: 1 });
        batch.insert({ a: 2 });

        batch.execute({ writeConcern: { w: 2, wtimeoutMS: 1000 } }, function (err) {
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
      client.connect((err, client) => {
        const db = client.db();
        const col = db.collection('batch_write_concerns_ops_1');
        let batch = col.initializeOrderedBulkOp();
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
      client.connect((err, client) => {
        const db = client.db();
        const insertFirst = false;
        const batchSize = 1000;
        const collection = db.collection('batch_write_unordered_split_test');
        let operation = collection.initializeUnorderedBulkOp();
        const documents = [];

        let i = 0;
        for (; i < 10000; i++) {
          const document = { name: 'bob' + i };
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
          for (let i = 0; i < batchSize; i++) {
            operation.find({ _id: documents[i]._id }).replaceOne({ name: 'joe' + i });
          }
        }
      });
    }
  });

  it('should correctly split ordered bulk batch', {
    metadata: { requires: { topology: 'single', mongodb: '>2.5.4' } },

    test: function (done) {
      client.connect((err, client) => {
        const db = client.db();
        const insertFirst = false;
        const batchSize = 1000;
        const collection = db.collection('batch_write_ordered_split_test');
        let operation = collection.initializeOrderedBulkOp();
        const documents = [];

        for (let i = 0; i < 10000; i++) {
          const document = { name: 'bob' + i };
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
          for (let i = 10000; i < 10200; i++) {
            operation.insert({ name: 'bob' + i });
          }
        }

        function replaceDocuments() {
          for (let i = 0; i < batchSize; i++) {
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
      client.connect((err, client) => {
        const db = client.db();
        const docs = [];
        for (let i = 0; i < 5; i++) {
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

  it('should return an error instead of throwing when no operations are provided for ordered bulk operation execute', async () => {
    const db = client.db();
    const error = await db
      .collection('doesnt_matter')
      .insertMany([])
      .catch(error => error);
    expect(error).to.be.instanceOf(MongoDriverError);
    expect(error).to.have.property('message', 'Invalid BulkOperation, Batch cannot be empty');
  });

  it('should return an error instead of throwing when no operations are provided for unordered bulk operation execute', async function () {
    const error = await client
      .db()
      .collection('doesnt_matter')
      .insertMany([], { ordered: false })
      .catch(error => error);
    expect(error).to.be.instanceOf(MongoDriverError);
    expect(error).to.have.property('message', 'Invalid BulkOperation, Batch cannot be empty');
  });

  it('should return an error instead of throwing when an empty bulk operation is submitted (with promise)', function () {
    return client
      .db()
      .collection('doesnt_matter')
      .insertMany([])

      .then(function () {
        test.equal(false, true); // this should not happen!
      })
      .catch(function (err) {
        expect(err).to.be.instanceOf(MongoDriverError);
        expect(err).to.have.property('message', 'Invalid BulkOperation, Batch cannot be empty');
      });
  });

  it('should properly account for array key size in bulk unordered inserts', function () {
    const documents = new Array(20000).fill('').map(() => ({
      arr: new Array(19).fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    }));

    // NOTE: Hack to get around unrelated strange error in bulkWrites for right now.
    return client
      .db()
      .dropCollection('doesnt_matter')
      .catch(() => {
        // ignore
      })
      .then(() => {
        return client.db().createCollection('doesnt_matter');
      })
      .then(() => {
        const coll = client.db().collection('doesnt_matter');
        return coll.insertMany(documents, { ordered: false });
      });
  });

  it('should properly account for array key size in bulk ordered inserts', function () {
    const documents = new Array(20000).fill('').map(() => ({
      arr: new Array(19).fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    }));

    return client
      .db()
      .dropCollection('doesnt_matter')
      .catch(() => {
        // ignore
      })
      .then(() => {
        return client.db().createCollection('doesnt_matter');
      })
      .then(() => {
        const coll = client.db().collection('doesnt_matter');
        return coll.insertMany(documents, { ordered: true });
      });
  });

  it('properly accounts for bson size in bytes in bulk ordered inserts', function () {
    const size = MAX_BSON_SIZE / 2;
    const largeString = crypto.randomBytes(size - 100).toString('hex');
    const documents = [{ s: largeString }, { s: largeString }];

    let db;

    return client
      .connect()
      .then(() => {
        db = client.db();
        return db.dropCollection('doesnt_matter').catch(() => {
          // ignore
        });
      })
      .then(() => {
        return db.createCollection('doesnt_matter');
      })
      .then(() => {
        const coll = db.collection('doesnt_matter');
        return coll.insertMany(documents, { ordered: true });
      })
      .finally(() => client.close());
  });

  it('properly accounts for bson size in bytes in bulk unordered inserts', function () {
    const size = MAX_BSON_SIZE / 2;
    const largeString = crypto.randomBytes(size - 100).toString('hex');
    const documents = [{ s: largeString }, { s: largeString }];

    let db;

    return client
      .connect()
      .then(() => {
        db = client.db();
        return db.dropCollection('doesnt_matter').catch(() => {
          // ignore
        });
      })
      .then(() => {
        return db.createCollection('doesnt_matter');
      })
      .then(() => {
        const coll = db.collection('doesnt_matter');
        return coll.insertMany(documents, { ordered: false });
      })
      .finally(() => client.close());
  });

  function testPropagationOfBulkWriteError(bulk) {
    return bulk.execute().then(
      () => {
        throw new Error('Expected execute to error but it passed');
      },
      err => {
        expect(err).to.be.an.instanceOf(MongoDriverError);
      }
    );
  }

  it('should propagate the proper error from executing an empty ordered batch', async function () {
    await client.connect();
    const collection = client.db().collection('doesnt_matter');
    await testPropagationOfBulkWriteError(collection.initializeOrderedBulkOp());
    await client.close();
  });

  it('should propagate the proper error from executing an empty unordered batch', function () {
    return client
      .connect()
      .then(() => {
        const collection = client.db().collection('doesnt_matter');

        return testPropagationOfBulkWriteError(collection.initializeUnorderedBulkOp());
      })
      .then(() => client.close());
  });

  it('should promote a single error to the top-level message, and preserve writeErrors', function () {
    return client.connect().then(() => {
      this.defer(() => client.close());

      const coll = client.db().collection<{ _id: number; a: number }>('single_bulk_write_error');
      return coll
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => coll.insertMany(Array.from({ length: 4 }, (_, i) => ({ _id: i, a: i }))))
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
    return client.connect().then(() => {
      this.defer(() => client.close());

      const coll = client.db().collection<{ _id: number; a: number }>('bulk_write_ordering_test');
      return coll
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => coll.insertMany(Array.from({ length: 4 }, (_, i) => ({ _id: i, a: i }))))
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

  it('should return correct ids for documents with generated ids', function (done) {
    const bulk = client.db().collection('coll').initializeUnorderedBulkOp();
    for (let i = 0; i < 2; i++) bulk.insert({ x: 1 });
    bulk.execute((err, result) => {
      expect(err).to.not.exist;
      expect(result).property('insertedIds').to.exist;
      expect(Object.keys(result.insertedIds)).to.have.length(2);
      expect(result.insertedIds[0]).to.exist;
      expect(result.insertedIds[1]).to.exist;
      done();
    });
  });

  it('should throw an error if bulk execute is called more than once', function (done) {
    const bulk = client.db().collection('coll').initializeUnorderedBulkOp();
    bulk.insert({});

    bulk.execute((err, result) => {
      expect(err).to.not.exist;
      expect(result).to.exist;

      bulk.execute(err => {
        expect(err).to.be.instanceof(MongoBatchReExecutionError);
        done();
      });
    });
  });

  it('should apply collation via FindOperators', {
    metadata: { requires: { mongodb: '>= 3.4' } },
    async test() {
      const locales = ['fr', 'de', 'es'];
      const bulk = client.db().collection('coll').initializeOrderedBulkOp();

      const events = [];
      client.on('commandStarted', event => {
        if (['update', 'delete'].includes(event.commandName)) {
          events.push(event);
        }
      });

      // updates
      bulk
        .find({ b: 1 })
        .collation({ locale: locales[0] })
        .updateOne({ $set: { b: 2 } });
      bulk
        .find({ b: 2 })
        .collation({ locale: locales[1] })
        .update({ $set: { b: 3 } });
      bulk.find({ b: 3 }).collation({ locale: locales[2] }).replaceOne({ b: 2 });

      // deletes
      bulk.find({ b: 2 }).collation({ locale: locales[0] }).deleteOne();
      bulk.find({ b: 1 }).collation({ locale: locales[1] }).delete();

      await bulk.execute();

      try {
        expect(events).to.be.an('array').with.length.at.least(1);
        expect(events[0]).property('commandName').to.equal('update');
        const updateCommand = events[0].command;
        expect(updateCommand).property('updates').to.be.an('array').with.length(3);
        updateCommand.updates.forEach((statement, idx) => {
          expect(statement).property('collation').to.eql({ locale: locales[idx] });
        });
        expect(events[1]).property('commandName').to.equal('delete');
        const deleteCommand = events[1].command;
        expect(deleteCommand).property('deletes').to.be.an('array').with.length(2);
        deleteCommand.deletes.forEach((statement, idx) => {
          expect(statement).property('collation').to.eql({ locale: locales[idx] });
        });
      } finally {
        await client.close();
      }
    }
  });

  it('should apply hint via FindOperators', {
    metadata: { requires: { mongodb: '>= 4.4' } },
    async test() {
      const bulk = client.db().collection('coll').initializeOrderedBulkOp();

      const events = [];
      client.on('commandStarted', event => {
        if (['update', 'delete'].includes(event.commandName)) {
          events.push(event);
        }
      });

      // updates
      bulk
        .find({ b: 1 })
        .hint({ b: 1 })
        .updateOne({ $set: { b: 2 } });
      bulk
        .find({ b: 2 })
        .hint({ b: 1 })
        .update({ $set: { b: 3 } });
      bulk.find({ b: 3 }).hint({ b: 1 }).replaceOne({ b: 2 });

      // deletes
      bulk.find({ b: 2 }).hint({ b: 1 }).deleteOne();
      bulk.find({ b: 1 }).hint({ b: 1 }).delete();

      await bulk.execute();

      expect(events).to.be.an('array').with.length.at.least(1);
      expect(events[0]).property('commandName').to.equal('update');
      const updateCommand = events[0].command;
      expect(updateCommand).property('updates').to.be.an('array').with.length(3);
      updateCommand.updates.forEach(statement => {
        expect(statement).property('hint').to.eql({ b: 1 });
      });
      expect(events[1]).property('commandName').to.equal('delete');
      const deleteCommand = events[1].command;
      expect(deleteCommand).property('deletes').to.be.an('array').with.length(2);
      deleteCommand.deletes.forEach(statement => {
        expect(statement).property('hint').to.eql({ b: 1 });
      });
    }
  });

  it('should apply arrayFilters to bulk updates via FindOperators', {
    metadata: { requires: { mongodb: '>= 3.6' } },
    test: function (done) {
      const events = [];
      client.on('commandStarted', event => {
        if (['update', 'delete'].includes(event.commandName)) {
          events.push(event);
        }
      });

      client.db().dropCollection('bulkArrayFilters', () => {
        const coll = client.db().collection('bulkArrayFilters');
        const bulk = coll.initializeOrderedBulkOp();

        bulk.insert({ person: 'Foo', scores: [4, 9, 12] });
        bulk.insert({ person: 'Bar', scores: [13, 0, 52] });
        bulk
          .find({ scores: { $lt: 1 } })
          .arrayFilters([{ e: { $lt: 1 } }])
          .updateOne({ $set: { 'scores.$[e]': 1 } });
        bulk
          .find({ scores: { $gte: 10 } })
          .arrayFilters([{ e: { $gte: 10 } }])
          .update({ $set: { 'scores.$[e]': 10 } });

        bulk.execute(err => {
          expect(err).to.not.exist;
          expect(events).to.be.an('array').with.lengthOf(1);
          expect(events[0]).to.have.property('commandName', 'update');
          const updateCommand = events[0].command;
          expect(updateCommand).property('updates').to.be.an('array').with.lengthOf(2);
          updateCommand.updates.forEach(update => expect(update).to.have.property('arrayFilters'));
          coll.find({}).toArray((err, result) => {
            expect(err).to.not.exist;
            expect(result[0]).to.containSubset({
              person: 'Foo',
              scores: [4, 9, 10]
            });
            expect(result[1]).to.containSubset({
              person: 'Bar',
              scores: [10, 1, 10]
            });
            client.close(done);
          });
        });
      });
    }
  });

  it('should accept pipeline-style updates', {
    metadata: { requires: { mongodb: '>= 4.2' } },
    async test() {
      const coll = client.db().collection('coll');
      const bulk = coll.initializeOrderedBulkOp();

      await coll.insertMany([{ a: 1 }, { a: 2 }]);

      bulk.find({ a: 1 }).updateOne([{ $project: { a: { $add: ['$a', 10] } } }]);
      bulk.find({ a: 2 }).update([{ $project: { a: { $add: ['$a', 100] } } }]);

      await bulk.execute();

      const contents = await coll.find().project({ _id: 0 }).toArray();
      expect(contents).to.deep.equal([{ a: 11 }, { a: 102 }]);
    }
  });

  it('should throw an error if raw operations are passed to bulkWrite', function () {
    const coll = client.db().collection('single_bulk_write_error');
    return coll
      .bulkWrite([
        { updateOne: { q: { a: 2 }, u: { $set: { a: 2 } }, upsert: true } },
        { deleteOne: { q: { c: 1 } } }
      ])
      .then(
        () => {
          throw new Error('expected a bulk error');
        },
        err => {
          expect(err).to.match(/Raw operations are not allowed/);
        }
      );
  });

  describe('Bulk operation transaction rollback', () => {
    let collection: Collection<{ answer: number }>;

    beforeEach(async function () {
      try {
        await client
          .db('bulk_operation_writes_test')
          .collection('bulk_write_transaction_test')
          .drop();
      } catch (_) {
        // do not care
      }

      collection = await client
        .db('bulk_operation_writes_test')
        .createCollection('bulk_write_transaction_test');

      await collection.deleteMany({});
    });

    it('should abort ordered bulk operation writes', {
      metadata: { requires: { mongodb: '>= 4.2', topology: ['replicaset'] } },
      async test() {
        const session = client.startSession();
        session.startTransaction({
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' }
        });

        let bulk = undefined;

        bulk = collection.initializeOrderedBulkOp({ session });
        bulk.insert({ answer: 42 });
        await bulk.execute();

        await session.abortTransaction();
        await session.endSession();

        const documents = await collection.find().toArray();

        expect(documents).to.have.lengthOf(
          0,
          'bulk operation writes were made outside of transaction'
        );
      }
    });

    it('should abort unordered bulk operation writes', {
      metadata: { requires: { mongodb: '>= 4.2', topology: ['replicaset'] } },
      async test() {
        const session = client.startSession();
        session.startTransaction({
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' }
        });

        let bulk = undefined;

        bulk = collection.initializeUnorderedBulkOp({ session });
        bulk.insert({ answer: 42 });
        await bulk.execute();

        await session.abortTransaction();
        await session.endSession();

        const documents = await collection.find().toArray();

        expect(documents).to.have.lengthOf(
          0,
          'bulk operation writes were made outside of transaction'
        );
      }
    });

    it('should abort unordered bulk operation writes using withTransaction', {
      metadata: { requires: { mongodb: '>= 4.2', topology: ['replicaset'] } },
      async test() {
        const session = client.startSession();

        await session.withTransaction(
          async () => {
            let bulk = undefined;

            bulk = collection.initializeUnorderedBulkOp({ session });
            bulk.insert({ answer: 42 });
            await bulk.execute();
            await session.abortTransaction();
          },
          { readConcern: { level: 'local' }, writeConcern: { w: 'majority' } }
        );

        await session.endSession();

        const documents = await collection.find().toArray();

        expect(documents).to.have.lengthOf(
          0,
          'bulk operation writes were made outside of transaction'
        );
      }
    });

    it('should abort ordered bulk operation writes using withTransaction', {
      metadata: { requires: { mongodb: '>= 4.2', topology: ['replicaset'] } },
      async test() {
        const session = client.startSession();

        await session.withTransaction(
          async () => {
            let bulk = undefined;

            bulk = collection.initializeOrderedBulkOp({ session });
            bulk.insert({ answer: 42 });
            await bulk.execute();
            await session.abortTransaction();
          },
          { readConcern: { level: 'local' }, writeConcern: { w: 'majority' } }
        );

        await session.endSession();

        const documents = await collection.find().toArray();

        expect(documents).to.have.lengthOf(
          0,
          'bulk operation writes were made outside of transaction'
        );
      }
    });
  });
});

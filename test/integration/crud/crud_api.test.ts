import { finished } from 'node:stream/promises';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Collection,
  CommandFailedEvent,
  type CommandStartedEvent,
  CommandSucceededEvent,
  type Db,
  MongoBulkWriteError,
  type MongoClient,
  MongoServerError,
  ObjectId,
  ReturnDocument
} from '../../../src';
import { type FailCommandFailPoint } from '../../tools/utils';
import { assert as test } from '../shared';

const DB_NAME = 'crud_api_tests';

describe.only('CRUD API', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();

    client.s.options.dbName = DB_NAME; // setup the default db

    const utilClient = this.configuration.newClient();
    await utilClient
      .db(DB_NAME)
      .dropDatabase()
      .catch(() => null); // clear out ns
    await utilClient
      .db(DB_NAME)
      .createCollection('test')
      .catch(() => null); // make ns exist
    await utilClient.close();
  });

  afterEach(async function () {
    sinon.restore();

    await client?.close();
    client = null;

    const cleanup = this.configuration.newClient();
    await cleanup
      .db(DB_NAME)
      .dropDatabase()
      .catch(() => null);

    await cleanup.close();
  });

  it('should correctly execute findOne method using crud api', async function () {
    const db = client.db();
    const collection = db.collection('t');

    await collection.insertOne({ findOneTest: 1 });

    const findOneResult = await collection.findOne({ findOneTest: 1 });

    expect(findOneResult).to.have.property('findOneTest', 1);
    expect(findOneResult).to.have.property('_id').that.is.instanceOf(ObjectId);

    const findNoneResult = await collection.findOne({ findOneTest: 2 });
    expect(findNoneResult).to.be.null;

    await collection.drop();
    await client.close();
  });

  describe('findOne()', () => {
    let client: MongoClient;
    let events;
    let collection: Collection<{ _id: number }>;

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
      events = [];
      client.on('commandSucceeded', commandSucceeded =>
        commandSucceeded.commandName === 'find' ? events.push(commandSucceeded) : null
      );
      client.on('commandFailed', commandFailed =>
        commandFailed.commandName === 'find' ? events.push(commandFailed) : null
      );

      collection = client.db('findOne').collection('findOne');
      await collection.drop().catch(() => null);
      await collection.insertMany([{ _id: 1 }, { _id: 2 }]);
    });

    afterEach(async () => {
      await collection.drop().catch(() => null);
      await client.close();
    });

    describe('when the operation succeeds', () => {
      it('the cursor for findOne is closed', async function () {
        const spy = sinon.spy(Collection.prototype, 'find');
        const result = await collection.findOne({});
        expect(result).to.deep.equal({ _id: 1 });
        expect(events.at(0)).to.be.instanceOf(CommandSucceededEvent);
        expect(spy.returnValues.at(0)).to.have.property('closed', true);
        expect(spy.returnValues.at(0)).to.have.nested.property('session.hasEnded', true);
      });
    });

    describe('when the find operation fails', () => {
      beforeEach(async function () {
        const failPoint: FailCommandFailPoint = {
          configureFailPoint: 'failCommand',
          mode: 'alwaysOn',
          data: {
            failCommands: ['find'],
            // 1 == InternalError, but this value not important to the test
            errorCode: 1
          }
        };
        await client.db().admin().command(failPoint);
      });

      afterEach(async function () {
        const failPoint: FailCommandFailPoint = {
          configureFailPoint: 'failCommand',
          mode: 'off',
          data: { failCommands: ['find'] }
        };
        await client.db().admin().command(failPoint);
      });

      it('the cursor for findOne is closed', async function () {
        const spy = sinon.spy(Collection.prototype, 'find');
        const error = await collection.findOne({}).catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(events.at(0)).to.be.instanceOf(CommandFailedEvent);
        expect(spy.returnValues.at(0)).to.have.property('closed', true);
        expect(spy.returnValues.at(0)).to.have.nested.property('session.hasEnded', true);
      });
    });
  });

  describe('countDocuments()', () => {
    let client: MongoClient;
    let events: (CommandFailedEvent | CommandSucceededEvent)[];
    let collection: Collection<{ _id: number }>;

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
      events = [];
      client.on('commandSucceeded', commandSucceeded =>
        commandSucceeded.commandName === 'aggregate' ? events.push(commandSucceeded) : null
      );
      client.on('commandFailed', commandFailed =>
        commandFailed.commandName === 'aggregate' ? events.push(commandFailed) : null
      );

      collection = client.db('countDocuments').collection('countDocuments');
      await collection.drop().catch(() => null);
      await collection.insertMany([{ _id: 1 }, { _id: 2 }]);
    });

    afterEach(async () => {
      await collection.drop().catch(() => null);
      await client.close();
    });

    describe('when the aggregation operation succeeds', () => {
      it('the cursor for countDocuments is closed', async function () {
        const spy = sinon.spy(Collection.prototype, 'aggregate');
        const result = await collection.countDocuments({});
        expect(result).to.deep.equal(2);
        expect(events[0]).to.be.instanceOf(CommandSucceededEvent);
        expect(spy.returnValues[0]).to.have.property('closed', true);
        expect(spy.returnValues[0]).to.have.nested.property('session.hasEnded', true);
      });
    });

    describe('when the aggregation operation fails', () => {
      beforeEach(async function () {
        const failPoint: FailCommandFailPoint = {
          configureFailPoint: 'failCommand',
          mode: 'alwaysOn',
          data: {
            failCommands: ['aggregate'],
            // 1 == InternalError, but this value not important to the test
            errorCode: 1
          }
        };
        await client.db().admin().command(failPoint);
      });

      afterEach(async function () {
        const failPoint: FailCommandFailPoint = {
          configureFailPoint: 'failCommand',
          mode: 'off',
          data: { failCommands: ['aggregate'] }
        };
        await client.db().admin().command(failPoint);
      });

      it('the cursor for countDocuments is closed', async function () {
        const spy = sinon.spy(Collection.prototype, 'aggregate');
        const error = await collection.countDocuments({}).catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(events.at(0)).to.be.instanceOf(CommandFailedEvent);
        expect(spy.returnValues.at(0)).to.have.property('closed', true);
        expect(spy.returnValues.at(0)).to.have.nested.property('session.hasEnded', true);
      });
    });
  });

  context('when creating a cursor with find', () => {
    let collection: Collection;

    beforeEach(async () => {
      collection = client.db().collection('t');
      await collection.drop().catch(() => null);
      await collection.insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }]);
    });

    afterEach(async () => {
      await collection?.drop().catch(() => null);
    });

    const makeCursor = () => {
      // Possible methods on the the cursor instance
      return collection
        .find({})
        .filter({ a: 1 })
        .addCursorFlag('noCursorTimeout', true)
        .addQueryModifier('$comment', 'some comment')
        .batchSize(1)
        .comment('some comment 2')
        .limit(2)
        .maxTimeMS(50)
        .project({ a: 1 })
        .skip(0)
        .sort({ a: 1 });
    };

    describe('#count()', () => {
      it('returns the number of documents', async () => {
        const cursor = makeCursor();
        const res = await cursor.count();
        expect(res).to.equal(2);
      });
    });

    describe('#forEach()', () => {
      it('iterates all the documents', async () => {
        const cursor = makeCursor();
        let count = 0;
        await cursor.forEach(() => {
          count += 1;
        });
        expect(count).to.equal(2);
      });
    });

    describe('#toArray()', () => {
      it('returns an array with all documents', async () => {
        const cursor = makeCursor();
        const res = await cursor.toArray();
        expect(res).to.have.lengthOf(2);
      });
    });

    describe('#next()', () => {
      it('is callable without blocking', async () => {
        const cursor = makeCursor();
        const doc0 = await cursor.next();
        expect(doc0).to.exist;
        const doc1 = await cursor.next();
        expect(doc1).to.exist;
        const doc2 = await cursor.next();
        expect(doc2).to.not.exist;
      });
    });

    describe('#stream()', () => {
      it('creates a node stream that emits data events', async () => {
        let count = 0;
        const stream = makeCursor().stream();
        const willFinish = finished(stream, { cleanup: true });
        stream.on('data', () => {
          count++;
        });
        await willFinish;
        expect(count).to.equal(2);
      });
    });

    describe('#explain()', () => {
      it('returns an explain document', async () => {
        const cursor = makeCursor();
        const result = await cursor.explain();
        expect(result).to.exist;
      });
    });
  });

  describe('should correctly execute aggregation method using crud api', () => {
    let db: Db;

    beforeEach(async function () {
      db = client.db();
      await db.collection('t1').insertMany([{ a: 1 }, { a: 1 }, { a: 2 }, { a: 1 }]);
    });

    afterEach(async function () {
      await db.collection('t1').drop();
    });

    it('allMethods', async function () {
      const cursor = db.collection('t1').aggregate([{ $match: {} }], {
        allowDiskUse: true,
        batchSize: 2,
        maxTimeMS: 50
      });

      // Exercise all the options
      cursor
        .geoNear({ geo: 1 })
        .group({ group: 1 })
        .limit(10)
        .match({ match: 1 })
        .maxTimeMS(10)
        .out('collection')
        .project({ project: 1 })
        .redact({ redact: 1 })
        .skip(1)
        .sort({ sort: 1 })
        .batchSize(10)
        .unwind('name');

      // Execute the command with all steps defined
      // will fail
      const err = await cursor.toArray().catch(err => err);
      test.ok(err != null);
    });

    it('#toArray()', async function () {
      const cursor = db.collection('t1').aggregate();
      cursor.match({ a: 1 });
      const docs = await cursor.toArray();
      test.equal(3, docs.length);
    });

    it('#next()', async function () {
      const cursor = db.collection('t1').aggregate();
      cursor.match({ a: 1 });
      await cursor.next();
    });

    it('#forEach()', async function () {
      let count = 0;
      const cursor = db.collection('t1').aggregate();
      cursor.match({ a: 1 });
      await cursor.forEach(() => {
        count = count + 1;
      });
      test.equal(3, count);
    });

    it('stream', async function () {
      const cursor = db.collection('t1').aggregate();
      let count = 0;
      cursor.match({ a: 1 });
      const stream = cursor.stream();
      const willFinish = finished(stream, { cleanup: true });
      stream.on('data', function () {
        count = count + 1;
      });
      await willFinish;
      test.equal(3, count);
    });

    it('#explain()', async function () {
      const cursor = db.collection('t1').aggregate();
      const result = await cursor.explain();
      test.ok(result != null);
    });
  });

  describe('should correctly execute insert methods using crud api', function () {
    let db: Db;

    before(function () {
      db = client.db();
    });

    it('#insertMany()', async function () {
      const r = await db.collection('t2_1').insertMany([{ a: 1 }, { a: 2 }]);
      expect(r).property('insertedCount').to.equal(2);
    });
    it('bulk inserts', async function () {
      const bulk = db.collection('t2_2').initializeOrderedBulkOp();
      bulk.insert({ a: 1 });
      bulk.insert({ a: 1 });
      await bulk.execute();
    });

    it('#insertOne()', async function () {
      const r = await db.collection('t2_3').insertOne({ a: 1 }, { writeConcern: { w: 1 } });
      expect(r).property('insertedId').to.exist;
    });

    it('bulk write unordered', async function () {
      const i = await db.collection('t2_5').insertMany([{ c: 1 }], { writeConcern: { w: 1 } });
      expect(i).property('insertedCount').to.equal(1);

      const r = await db
        .collection('t2_4')
        .bulkWrite(
          [
            { insertOne: { document: { a: 1 } } },
            { insertOne: { document: { g: 1 } } },
            { insertOne: { document: { g: 2 } } },
            { updateOne: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { updateMany: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { deleteOne: { filter: { c: 1 } } },
            { deleteMany: { filter: { c: 1 } } }
          ],
          { ordered: false, writeConcern: { w: 1 } }
        );

      test.equal(3, r.insertedCount);
      test.equal(1, r.upsertedCount);
      test.equal(1, r.deletedCount);

      // Crud fields
      test.equal(3, r.insertedCount);
      test.equal(3, Object.keys(r.insertedIds).length);
      test.equal(1, r.matchedCount);
      test.equal(1, r.deletedCount);
      test.equal(1, r.upsertedCount);
      test.equal(1, Object.keys(r.upsertedIds).length);
    });

    it('bulk write ordered', async function () {
      const i = await db.collection('t2_7').insertMany([{ c: 1 }], { writeConcern: { w: 1 } });
      expect(i).property('insertedCount').to.equal(1);

      const r = await db
        .collection('t2_5')
        .bulkWrite(
          [
            { insertOne: { document: { a: 1 } } },
            { insertOne: { document: { g: 1 } } },
            { insertOne: { document: { g: 2 } } },
            { updateOne: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { updateMany: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { deleteOne: { filter: { c: 1 } } },
            { deleteMany: { filter: { c: 1 } } }
          ],
          { ordered: true, writeConcern: { w: 1 } }
        );

      test.equal(3, r.insertedCount);
      test.equal(1, r.upsertedCount);
      test.equal(1, r.deletedCount);

      // Crud fields
      test.equal(3, r.insertedCount);
      test.equal(3, Object.keys(r.insertedIds).length);
      test.equal(1, r.matchedCount);
      test.equal(1, r.deletedCount);
      test.equal(1, r.upsertedCount);
      test.equal(1, Object.keys(r.upsertedIds).length);
    });
  });

  describe(
    'should correctly execute update methods using crud api',
    {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    function () {
      let db: Db;

      before(function () {
        db = client.db();
      });

      it('legacy update', async function () {
        const r = await db
          .collection('t3_1')
          // @ts-expect-error Not allowed in TS, but allowed for legacy compat
          .update({ a: 1 }, { $set: { a: 2 } }, { upsert: true });
        expect(r).property('upsertedCount').to.equal(1);
      });

      it('#updateOne()', async function () {
        const i = await db.collection('t3_2').insertMany([{ c: 1 }], { writeConcern: { w: 1 } });
        expect(i).property('insertedCount').to.equal(1);

        const u1 = await db
          .collection('t3_2')
          .updateOne({ a: 1 }, { $set: { a: 1 } }, { upsert: true });
        expect(u1).property('upsertedCount').to.equal(1);
        test.equal(0, u1.matchedCount);
        test.ok(u1.upsertedId != null);

        const u2 = await db.collection('t3_2').updateOne({ c: 1 }, { $set: { a: 1 } });
        expect(u2).property('modifiedCount').to.equal(1);
        test.equal(1, u2.matchedCount);
        test.ok(u2.upsertedId == null);
      });

      it('#replaceOne()', async function () {
        const r1 = await db.collection('t3_3').replaceOne({ a: 1 }, { a: 2 }, { upsert: true });
        expect(r1).property('upsertedCount').to.equal(1);
        test.equal(0, r1.matchedCount);
        test.ok(r1.upsertedId != null);

        const r2 = await db.collection('t3_3').replaceOne({ a: 2 }, { a: 3 }, { upsert: true });
        expect(r2).property('modifiedCount').to.equal(1);
        expect(r2).property('upsertedCount').to.equal(0);
        expect(r2).property('matchedCount').to.equal(1);
      });

      it('#updateMany()', async function () {
        const i = await db
          .collection('t3_4')
          .insertMany([{ a: 1 }, { a: 1 }], { writeConcern: { w: 1 } });
        expect(i).property('insertedCount').to.equal(2);

        const u1 = await db
          .collection('t3_4')
          .updateMany({ a: 1 }, { $set: { a: 2 } }, { upsert: true, writeConcern: { w: 1 } });
        expect(u1).property('modifiedCount').to.equal(2);
        test.equal(2, u1.matchedCount);
        test.ok(u1.upsertedId == null);

        const u2 = await db
          .collection('t3_4')
          .updateMany({ c: 1 }, { $set: { d: 2 } }, { upsert: true, writeConcern: { w: 1 } });
        test.equal(0, u2.matchedCount);
        test.ok(u2.upsertedId != null);
      });
    }
  );

  describe('#findOneAndDelete', function () {
    let collection: Collection;

    beforeEach(async function () {
      await client.connect();
      collection = client.db().collection('findAndModifyTest');
    });

    afterEach(async function () {
      await collection.drop();
    });

    context('when includeResultMetadata is true', function () {
      beforeEach(async function () {
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      it('returns the modify result', async function () {
        const result = await collection.findOneAndDelete(
          { a: 1 },
          { projection: { b: 1 }, sort: { a: 1 }, includeResultMetadata: true }
        );
        expect(result?.lastErrorObject.n).to.equal(1);
        expect(result?.value.b).to.equal(1);
      });
    });

    context('when includeResultMetadata is false', function () {
      beforeEach(async function () {
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      it('returns the deleted document', async function () {
        const result = await collection.findOneAndDelete(
          { a: 1 },
          { projection: { b: 1 }, sort: { a: 1 }, includeResultMetadata: false }
        );
        expect(result?.b).to.equal(1);
      });
    });
  });

  describe('#findOneAndReplace', function () {
    let collection: Collection;

    beforeEach(async function () {
      await client.connect();
      collection = client.db().collection('findAndModifyTest');
    });

    afterEach(async function () {
      await collection.drop();
    });

    context('when includeResultMetadata is true', function () {
      beforeEach(async function () {
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      it('returns the modify result', async function () {
        const result = await collection.findOneAndReplace(
          { a: 1 },
          { c: 1, b: 1 },
          {
            projection: { b: 1, c: 1 },
            sort: { a: 1 },
            returnDocument: ReturnDocument.AFTER,
            upsert: true,
            includeResultMetadata: true
          }
        );
        expect(result?.lastErrorObject.n).to.equal(1);
        expect(result?.value.b).to.equal(1);
        expect(result?.value.c).to.equal(1);
      });
    });

    context('when includeResultMetadata is false', function () {
      beforeEach(async function () {
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      it('returns the replaced document', async function () {
        const result = await collection.findOneAndReplace(
          { a: 1 },
          { c: 1, b: 1 },
          {
            projection: { b: 1, c: 1 },
            sort: { a: 1 },
            returnDocument: ReturnDocument.AFTER,
            upsert: true,
            includeResultMetadata: false
          }
        );
        expect(result?.b).to.equal(1);
        expect(result?.c).to.equal(1);
      });
    });
  });

  describe('#updateOne', function () {
    let collection: Collection;

    beforeEach(async function () {
      collection = client.db().collection('updateOneTest');
    });

    context(
      'when including an update with all undefined atomic operators ignoring undefined',
      function () {
        beforeEach(async function () {
          client = this.configuration.newClient();
        });

        it('throws an error', async function () {
          const error = await collection
            .updateOne({ a: 1 }, { $set: undefined, $unset: undefined }, { ignoreUndefined: true })
            .catch(error => error);
          expect(error.message).to.include(
            'Update operations require that all atomic operators have defined values, but none were provided'
          );
        });
      }
    );
  });

  describe('#updateMany', function () {
    let collection: Collection;

    beforeEach(async function () {
      collection = client.db().collection('updateManyTest');
    });

    context(
      'when including an update with all undefined atomic operators ignoring undefined',
      function () {
        beforeEach(async function () {
          client = this.configuration.newClient();
        });

        it('throws an error', async function () {
          const error = await collection
            .updateMany({ a: 1 }, { $set: undefined, $unset: undefined }, { ignoreUndefined: true })
            .catch(error => error);
          expect(error.message).to.include(
            'Update operations require that all atomic operators have defined values, but none were provided'
          );
        });
      }
    );
  });

  describe('#findOneAndUpdate', function () {
    let collection: Collection;

    beforeEach(async function () {
      collection = client.db().collection('findAndModifyTest');
    });

    context(
      'when including an update with all undefined atomic operators ignoring undefined',
      function () {
        beforeEach(async function () {
          client = this.configuration.newClient();
        });

        it('throws an error', async function () {
          const error = await collection
            .findOneAndUpdate(
              { a: 1 },
              { $set: undefined, $unset: undefined },
              { ignoreUndefined: true }
            )
            .catch(error => error);
          expect(error.message).to.include(
            'Update operations require that all atomic operators have defined values, but none were provided'
          );
        });
      }
    );

    context('when includeResultMetadata is true', function () {
      beforeEach(async function () {
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      it('returns the modify result', async function () {
        const result = await collection.findOneAndUpdate(
          { a: 1 },
          { $set: { d: 1 } },
          {
            projection: { b: 1, d: 1 },
            sort: { a: 1 },
            returnDocument: ReturnDocument.AFTER,
            upsert: true,
            includeResultMetadata: true
          }
        );
        expect(result?.lastErrorObject.n).to.equal(1);
        expect(result?.value.b).to.equal(1);
        expect(result?.value.d).to.equal(1);
      });
    });

    context('when includeResultMetadata is false', function () {
      beforeEach(async function () {
        await collection.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } });
      });

      it('returns the replaced document', async function () {
        const result = await collection.findOneAndUpdate(
          { a: 1 },
          { $set: { d: 1 } },
          {
            projection: { b: 1, d: 1 },
            sort: { a: 1 },
            returnDocument: ReturnDocument.AFTER,
            upsert: true,
            includeResultMetadata: false
          }
        );
        expect(result?.b).to.equal(1);
        expect(result?.d).to.equal(1);
      });
    });
  });

  it('should correctly execute removeMany with no selector', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const db = client.db();
      // Delete all items with no selector
      await db.collection('t6_1').deleteMany();
    }
  });

  it('should correctly execute crud operations with w:0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const db = client.db();

      const col = db.collection('shouldCorrectlyExecuteInsertOneWithW0');
      const i1 = await col.insertOne({ a: 1 }, { writeConcern: { w: 0 } });
      expect(i1).property('acknowledged').to.be.false;
      expect(i1).property('insertedId').to.exist;

      const i2 = await col.insertMany([{ a: 1 }], { writeConcern: { w: 0 } });
      expect(i2).to.exist;

      const u1 = await col.updateOne({ a: 1 }, { $set: { b: 1 } }, { writeConcern: { w: 0 } });
      expect(u1).to.exist;

      const u2 = await col.updateMany({ a: 1 }, { $set: { b: 1 } }, { writeConcern: { w: 0 } });
      expect(u2).to.exist;

      const d1 = await col.deleteOne({ a: 1 }, { writeConcern: { w: 0 } });
      expect(d1).to.exist;

      const d2 = await col.deleteMany({ a: 1 }, { writeConcern: { w: 0 } });
      expect(d2).to.exist;
    }
  });

  it('should correctly execute updateOne operations with w:0 and upsert', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const db = client.db();

      const r = await db
        .collection<{ _id: number }>('try')
        .updateOne({ _id: 1 }, { $set: { x: 1 } }, { upsert: true, writeConcern: { w: 0 } });
      test.ok(r != null);
    }
  });

  it('should correctly execute crud operations using w:0', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const db = client.db();

      const collection = db.collection<{ _id: number }>('w0crudoperations');
      const r = await collection.updateOne(
        { _id: 1 },
        { $set: { x: 1 } },
        { upsert: true, writeConcern: { w: 0 } }
      );
      test.ok(r != null);
    }
  });

  describe('when performing a multi-batch unordered bulk write that has a duplicate key', function () {
    it('throws a MongoBulkWriteError indicating the duplicate key document failed', async function () {
      const ops = [];
      // Create a set of operations that go over the 1000 limit causing two messages
      let i = 0;
      for (; i < 1005; i++) {
        ops.push({ insertOne: { _id: i, a: i } });
      }

      ops[500] = { insertOne: { _id: 0, a: i } };

      const db = client.db();

      const error = await db
        .collection('t20_1')
        .bulkWrite(ops, { ordered: false, writeConcern: { w: 1 } })
        .catch(error => error);

      expect(error).to.be.instanceOf(MongoBulkWriteError);
      // 1004 because one of them is duplicate key
      // but since it is unordered we continued to write
      expect(error).to.have.property('insertedCount', 1004);
      expect(error.writeErrors[0]).to.have.nested.property('err.index', 500);
    });
  });

  it('should correctly throw error on illegal callback when ordered bulkWrite encounters error', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: async function () {
      const ops = [];
      // Create a set of operations that go over the 1000 limit causing two messages
      let i = 0;
      for (; i < 1005; i++) {
        ops.push({ insertOne: { _id: i, a: i } });
      }

      ops.push({ insertOne: { _id: 0, a: i } });

      const db = client.db();
      await db.collection('t20_1').bulkWrite(ops, { ordered: true, writeConcern: { w: 1 } });
    }
  });

  describe('sort support', function () {
    let client: MongoClient;
    let events: Array<CommandStartedEvent>;
    let collection: Collection;

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
      events = [];
      client.on('commandStarted', commandStarted =>
        commandStarted.commandName === 'update' ? events.push(commandStarted) : null
      );

      collection = client.db('updateManyTest').collection('updateManyTest');
      await collection.drop().catch(() => null);
      await collection.insertMany([{ a: 1 }, { a: 2 }]);
    });

    afterEach(async function () {
      await collection.drop().catch(() => null);
      await client.close();
    });

    describe('collection.updateMany()', () => {
      it('does not attach a sort property if one is specified', async function () {
        // @ts-expect-error: sort is not supported
        await collection.updateMany({ a: { $gte: 1 } }, { $set: { b: 1 } }, { sort: { a: 1 } });

        expect(events).to.have.lengthOf(1);
        const [updateEvent] = events;
        expect(updateEvent.commandName).to.equal('update');
        expect(updateEvent.command.updates[0]).to.not.have.property('sort');
      });
    });

    describe('collection.bulkWrite([{updateMany}])', () => {
      it('does not attach a sort property if one is specified', async function () {
        await collection.bulkWrite([
          // @ts-expect-error: sort is not supported
          { updateMany: { filter: { a: { $gte: 1 } }, update: { $set: { b: 1 } }, sort: { a: 1 } } }
        ]);

        expect(events).to.have.lengthOf(1);
        const [updateEvent] = events;
        expect(updateEvent.commandName).to.equal('update');
        expect(updateEvent.command.updates[0]).to.not.have.property('sort');
      });
    });
  });
});

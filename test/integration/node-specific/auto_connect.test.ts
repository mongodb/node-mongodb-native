import { expect } from 'chai';
import { once } from 'events';

import {
  BSONType,
  ChangeStream,
  ClientSession,
  Collection,
  MongoClient,
  MongoNotConnectedError,
  ProfilingLevel,
  Topology,
  TopologyType
} from '../../mongodb';

describe('When executing an operation for the first time', () => {
  let client: MongoClient;

  beforeEach('create client', async function () {
    client = this.configuration.newClient();
  });

  beforeEach('create test namespace', async function () {
    const utilClient = this.configuration.newClient();

    await utilClient
      .db('test')
      .createCollection('test')
      .catch(() => null);

    await utilClient.close();
  });

  afterEach('cleanup client', async function () {
    await client.close();
  });

  describe(`class Admin`, () => {
    describe(`#addUser()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.addUser('neal', 'iLoveJavaScript', { roles: ['root'] }).catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#buildInfo()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.buildInfo();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#command()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.command({ ping: 1 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#listDatabases()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.listDatabases();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#ping()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.ping();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#removeUser()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.removeUser('neal').catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#replSetGetStatus()`, () => {
      it('should connect the client', { requires: { topology: 'replicaset' } }, async () => {
        const admin = client.db().admin();
        await admin.replSetGetStatus();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#serverInfo()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.serverInfo();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#serverStatus()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.serverStatus();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#validateCollection()`, () => {
      it('should connect the client', async () => {
        const admin = client.db().admin();
        await admin.validateCollection('test').catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  describe(`class AggregationCursor`, () => {
    const pipeline = [{ $match: { _id: { $type: BSONType.objectId } } }];

    describe(`#explain()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        await agg.explain().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#close()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        await agg.close().catch(error => {
          expect.fail('cursor.close should work without connecting: ' + error.message);
        });
      });
    });

    describe(`#forEach()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        await agg.forEach(item => {
          expect(item).to.be.a('object');
        });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#hasNext()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        await agg.hasNext();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#next()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        await agg.next();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#toArray()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        await agg.toArray();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#tryNext()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        await agg.tryNext();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#stream()`, () => {
      it('should connect the client', async () => {
        const agg = client.db().collection('test').aggregate(pipeline);
        const stream = agg.stream();
        await once(stream, 'readable');
        await stream.read();
        stream.destroy();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  describe(`class OrderedBulkOperation`, () => {
    describe(`#execute()`, () => {
      it('should not connect the client', async () => {
        expect(() => client.db().collection('test').initializeOrderedBulkOp()).to.throw(
          MongoNotConnectedError
        );
        expect(client).to.not.have.property('topology');
      });
    });
  });

  describe(`class UnorderedBulkOperation`, () => {
    describe(`#execute()`, () => {
      it('should not connect the client', async () => {
        expect(() => client.db().collection('test').initializeUnorderedBulkOp()).to.throw(
          MongoNotConnectedError
        );
        expect(client).to.not.have.property('topology');
      });
    });
  });

  describe(`class ChangeStream`, () => {
    let changeCausingClient;
    let changeCausingCollection: Collection;
    let collection: Collection;
    let cs: ChangeStream;
    beforeEach(async function () {
      if (this.configuration.topologyType === TopologyType.Single) {
        return;
      }
      changeCausingClient = this.configuration.newClient();
      await changeCausingClient
        .db('auto-connect-change')
        .createCollection('auto-connect')
        .catch(() => null);

      changeCausingCollection = changeCausingClient
        .db('auto-connect-change')
        .collection('auto-connect');

      collection = client.db('auto-connect-change').collection('auto-connect');
      cs = collection.watch();
    });

    afterEach(async function () {
      await changeCausingClient?.close();
      await cs?.close();
    });

    describe(`#close()`, { requires: { topology: '!single' } }, () => {
      it('should connect the client', async () => {
        await cs.close().catch(error => {
          expect.fail('cs.close should work without connecting: ' + error.message);
        });
      });
    });

    describe(`#hasNext()`, { requires: { topology: '!single' } }, () => {
      it('should connect the client', async () => {
        const willHaveNext = cs.hasNext();
        await once(cs.cursor, 'init');
        await changeCausingCollection.insertOne({ a: 1 });
        await willHaveNext;
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#next()`, { requires: { topology: '!single' } }, () => {
      it('should connect the client', async () => {
        const willBeNext = cs.next();
        await once(cs.cursor, 'init');
        await changeCausingCollection.insertOne({ a: 1 });
        await willBeNext;
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#tryNext()`, { requires: { topology: '!single' } }, () => {
      it('should connect the client', async () => {
        await cs.tryNext();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#stream()`, { requires: { topology: '!single' } }, () => {
      it('should connect the client', async () => {
        const stream = cs.stream();
        const willBeNext = stream[Symbol.asyncIterator]().next();
        await once(cs.cursor, 'init');
        await changeCausingCollection.insertOne({ a: 1 });
        await willBeNext;
        stream.destroy();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  describe(`class ClientSession`, () => {
    describe(`#abortTransaction()`, () => {
      it('should connect the client', async () => {
        const session = client.startSession();
        session.startTransaction();
        await session.abortTransaction(); // Abort transaction will not connect (as expected)
        expect(client).to.not.have.property('topology');
        await session.endSession();
      });
    });

    describe(`#commitTransaction()`, () => {
      it('should connect the client', async () => {
        const session = client.startSession();
        session.startTransaction();
        await session.commitTransaction(); // Commit transaction will not connect (as expected)
        expect(client).to.not.have.property('topology');
        await session.endSession();
      });
    });

    describe(`#endSession()`, () => {
      it('should connect the client', async () => {
        const session = client.startSession();
        await session.endSession();
        expect(client).to.not.have.property('topology');
      });
    });

    describe(`#withTransaction()`, () => {
      it('should connect the client', async () => {
        const session = client.startSession();
        await session.withTransaction(async () => {
          // withTransaction will not connect (as expected)
        });
        await session.endSession();
        expect(client).to.not.have.property('topology');
      });
    });
  });

  describe(`class Collection`, () => {
    describe(`#bulkWrite()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.bulkWrite([{ insertOne: { document: { a: 1 } } }]);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#count()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.count();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#countDocuments()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.countDocuments();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#createIndex()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.createIndex({ a: 1 }).catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#createIndexes()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.createIndexes([{ key: { a: 1 } }]).catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#deleteMany()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.deleteMany({ a: 1 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#deleteOne()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.deleteOne({ a: 1 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#distinct()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.distinct('a');
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#drop()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.drop();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#dropIndex()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.dropIndex('a_1').catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#dropIndexes()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.dropIndexes().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#estimatedDocumentCount()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.estimatedDocumentCount();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#findOne()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.findOne();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#findOneAndDelete()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.findOneAndDelete({ a: 1 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#findOneAndReplace()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.findOneAndReplace({ a: 1 }, { a: 2 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#findOneAndUpdate()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.findOneAndUpdate({ a: 1 }, { $set: { a: 2 } });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#indexes()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.indexes().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#indexExists()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.indexExists('a_1').catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#indexInformation()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.indexInformation().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#insertMany()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.insertMany([{ a: 1 }]);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#insertOne()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.insertOne({ a: 1 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#isCapped()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.isCapped();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#options()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.options();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#rename()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test0');
        await c.rename('test1').catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#replaceOne()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.replaceOne({ a: 1 }, { a: 2 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#stats()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.stats();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#updateMany()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.updateMany({ a: 1 }, { $set: { a: 2 } });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#updateOne()`, () => {
      it('should connect the client', async () => {
        const c = client.db().collection('test');
        await c.updateOne({ a: 1 }, { $set: { a: 2 } });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  describe(`class Db`, () => {
    describe(`#addUser()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.addUser('neal', 'iLoveJavaScript', { roles: ['dbAdmin'] }).catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#collections()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.collections();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#command()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.command({ ping: 1 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#createCollection()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.createCollection('test4');
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#createIndex()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.createIndex('test', { a: 1 });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#dropCollection()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.dropCollection('test');
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#dropDatabase()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.dropDatabase();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#indexInformation()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.indexInformation('test').catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#profilingLevel()`, () => {
      it('should connect the client', async () => {
        const db = client.db('admin');
        await db.profilingLevel().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#removeUser()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.removeUser('neal').catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#renameCollection()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.renameCollection('test0', 'test1').catch(() => null);

        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#setProfilingLevel()`, () => {
      it('should connect the client', async () => {
        const db = client.db('admin');
        await db.setProfilingLevel(ProfilingLevel.off).catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#stats()`, () => {
      it('should connect the client', async () => {
        const db = client.db();
        await db.stats();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  describe(`class FindCursor`, () => {
    describe(`#count()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.count();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#explain()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.explain().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#close()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.close();
        expect(client).to.not.have.property('topology');
      });
    });

    describe(`#forEach()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.forEach(item => {
          expect(item).to.be.a('object');
        });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#hasNext()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.hasNext();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#next()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.next();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#toArray()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.toArray();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#tryNext()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        await find.tryNext();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#stream()`, () => {
      it('should connect the client', async () => {
        const find = client.db().collection('test').find();
        const stream = find.stream();
        await once(stream, 'readable');
        await stream.read();
        stream.destroy();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  // GridFS APIs are all made up of CRUD APIs on collections and dbs.

  describe(`class ListCollectionsCursor`, () => {
    describe(`#forEach()`, () => {
      it('should connect the client', async () => {
        const collections = client.db().listCollections();
        await collections.forEach(item => {
          expect(item).is.an('object');
        });
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#hasNext()`, () => {
      it('should connect the client', async () => {
        const collections = client.db().listCollections();
        await collections.hasNext();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#next()`, () => {
      it('should connect the client', async () => {
        const collections = client.db().listCollections();
        await collections.next();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#toArray()`, () => {
      it('should connect the client', async () => {
        const collections = client.db().listCollections();
        await collections.toArray();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#tryNext()`, () => {
      it('should connect the client', async () => {
        const collections = client.db().listCollections();
        await collections.tryNext();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  describe(`class ListIndexesCursor`, () => {
    describe(`#forEach()`, () => {
      it('should connect the client', async () => {
        const indexes = client.db().collection('test').listIndexes();
        await indexes
          .forEach(item => {
            expect(item).is.an('object');
          })
          .catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#hasNext()`, () => {
      it('should connect the client', async () => {
        const indexes = client.db().collection('test').listIndexes();
        await indexes.hasNext().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#next()`, () => {
      it('should connect the client', async () => {
        const indexes = client.db().collection('test').listIndexes();
        await indexes.next().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#toArray()`, () => {
      it('should connect the client', async () => {
        const indexes = client.db().collection('test').listIndexes();
        await indexes.toArray().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    describe(`#tryNext()`, () => {
      it('should connect the client', async () => {
        const indexes = client.db().collection('test').listIndexes();
        await indexes.tryNext().catch(() => null);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  describe(`class MongoClient`, () => {
    describe(`#withSession()`, () => {
      it('should not connect the client', async () => {
        await client.withSession(async session => {
          expect(session).to.be.instanceOf(ClientSession);
        });
        expect(client).to.not.have.property('topology'); // withSession won't connect, that's expected
      });
    });
  });
});

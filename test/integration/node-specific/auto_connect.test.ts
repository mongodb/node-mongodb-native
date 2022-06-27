import { expect } from 'chai';
import { once } from 'events';
import { readFileSync } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

import {
  BSONType,
  GridFSBucket,
  MongoClient,
  MongoRuntimeError,
  MongoServerError,
  ObjectId,
  ProfilingLevel
} from '../../../src';
import { Topology } from '../../../src/sdam/topology';
import { ClientSession } from '../../../src/sessions';
import { sleep } from '../../tools/utils';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const printAPITests = () => {
  const api = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../etc/api.json'), { encoding: 'utf8' })
  );
  const packageMembers = api.members[0].members;
  const asyncAPIs = new Map(
    packageMembers
      .filter(({ kind }) => kind === 'Class')
      .filter(({ releaseTag }) => releaseTag === 'Public')
      .map(({ name, members }) => [
        name,
        Array.from(
          new Set(
            members
              .filter(({ kind }) => kind === 'Method')
              .filter(({ releaseTag }) => releaseTag === 'Public')
              .filter(
                ({ excerptTokens }) =>
                  excerptTokens.filter(({ text }) => text === 'Promise').length > 0
              )
              .map(({ name }) => name)
          )
        )
      ])
      .filter(([, methods]) => methods.length > 0)
  );

  const apis: Array<[string, string[]]> = Array.from(asyncAPIs.entries()) as any;
  apis.sort(([k0], [k1]) => k0.localeCompare(k1));
  for (const [owner, methods] of apis) {
    console.log(`\ncontext(\`class ${owner}\`, () => {`);
    for (const method of methods) {
      console.log(`\n  it(\`${method}()\`, () => {
    expect(2).to.equal(3);
  });`);
    }
    console.log('});');
  }
};

describe('MongoClient auto connect', () => {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  context(`class Admin`, () => {
    it(`addUser()`, async () => {
      const admin = client.db().admin();
      await admin.addUser('neal', 'iLoveJavaScript', { roles: ['root'] }).catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`buildInfo()`, async () => {
      const admin = client.db().admin();
      await admin.buildInfo();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`command()`, async () => {
      const admin = client.db().admin();
      await admin.command({ ping: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`listDatabases()`, async () => {
      const admin = client.db().admin();
      await admin.listDatabases();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`ping()`, async () => {
      const admin = client.db().admin();
      await admin.ping();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`removeUser()`, async () => {
      const admin = client.db().admin();
      await admin.removeUser('neal').catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`replSetGetStatus()`, { requires: { topology: 'replicaset' } }, async () => {
      const admin = client.db().admin();
      await admin.replSetGetStatus();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`serverInfo()`, async () => {
      const admin = client.db().admin();
      await admin.serverInfo();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`serverStatus()`, async () => {
      const admin = client.db().admin();
      await admin.serverStatus();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`validateCollection()`, async () => {
      const admin = client.db().admin();
      await admin.validateCollection('test').catch(() => null); // validation does not need to succeed
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class AggregationCursor`, () => {
    const pipeline = [{ $match: { _id: { $type: BSONType.objectId } } }];

    it(`explain()`, async () => {
      const agg = client.db().collection('test').aggregate(pipeline);
      await agg.explain().catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`close()`, async () => {
      const agg = client.db().collection('test').aggregate(pipeline);
      await agg.close().catch(error => {
        expect.fail('cursor.close should work without connecting: ' + error.message);
      });
    });

    it(`forEach()`, async () => {
      const agg = client.db().collection('test').aggregate(pipeline);
      await agg.forEach(item => {
        expect(item).to.be.a('object');
      });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`hasNext()`, async () => {
      const agg = client.db().collection('test').aggregate(pipeline);
      await agg.hasNext();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`next()`, async () => {
      const agg = client.db().collection('test').aggregate(pipeline);
      await agg.next();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`toArray()`, async () => {
      const agg = client.db().collection('test').aggregate(pipeline);
      await agg.toArray();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`tryNext()`, async () => {
      const agg = client.db().collection('test').aggregate(pipeline);
      await agg.tryNext();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class OrderedBulkOperation`, () => {
    it.skip(`execute()`, async () => {
      const bulk = client.db().collection('test').initializeOrderedBulkOp();
      bulk.find({ a: 1 });
      await bulk.execute();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    }).skipReason = 'TODO(NODE-4263): legacy bulk operations should auto connect';
  });

  context(`class UnorderedBulkOperation`, () => {
    it.skip(`execute()`, async () => {
      const bulk = client.db().collection('test').initializeUnorderedBulkOp();
      bulk.find({ a: 1 });
      await bulk.execute();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    }).skipReason = 'TODO(NODE-4263): legacy bulk operations should auto connect';
  });

  context(`class ChangeStream`, { requires: { topology: '!single' } }, () => {
    it(`close()`, async () => {
      const cs = client.watch();
      await cs.close().catch(error => {
        expect.fail('cs.close should work without connecting: ' + error.message);
      });
    });

    it(`hasNext()`, async () => {
      const cs = client.watch();
      await Promise.race([cs.hasNext(), sleep(1)]);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`next()`, async () => {
      const cs = client.watch();
      await Promise.race([cs.next(), sleep(1)]);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`tryNext()`, async () => {
      const cs = client.watch();
      await cs.tryNext();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class ClientSession`, () => {
    it(`abortTransaction()`, async () => {
      const session = client.startSession();
      session.startTransaction();
      await session.abortTransaction(); // Abort transaction will not connect (as expected)
      expect(client).to.not.have.property('topology');
      await session.endSession();
    });

    it(`commitTransaction()`, async () => {
      const session = client.startSession();
      session.startTransaction();
      await session.commitTransaction(); // Commit transaction will not connect (as expected)
      expect(client).to.not.have.property('topology');
      await session.endSession();
    });

    it(`endSession()`, async () => {
      const session = client.startSession();
      await session.endSession();
      expect(client).to.not.have.property('topology');
    });

    it(`withTransaction()`, async () => {
      const session = client.startSession();
      await session.withTransaction(async () => {
        // withTransaction will not connect (as expected)
      });
      await session.endSession();
      expect(client).to.not.have.property('topology');
    });
  });

  context(`class Collection`, () => {
    it(`bulkWrite()`, async () => {
      const c = client.db().collection('test');
      await c.bulkWrite([{ insertOne: { document: { a: 1 } } }]);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`count()`, async () => {
      const c = client.db().collection('test');
      await c.count();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`countDocuments()`, async () => {
      const c = client.db().collection('test');
      await c.countDocuments();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`createIndex()`, async () => {
      const c = client.db().collection('test');
      await c.createIndex({ a: 1 }).catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`createIndexes()`, async () => {
      const c = client.db().collection('test');
      await c.createIndexes([{ key: { a: 1 } }]).catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`deleteMany()`, async () => {
      const c = client.db().collection('test');
      await c.deleteMany({ a: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`deleteOne()`, async () => {
      const c = client.db().collection('test');
      await c.deleteOne({ a: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`distinct()`, async () => {
      const c = client.db().collection('test');
      await c.distinct('a');
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`drop()`, async () => {
      const c = client.db().collection('test');
      await c.drop();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`dropIndex()`, async () => {
      const c = client.db().collection('test');
      await c.dropIndex('a_1').catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`dropIndexes()`, async () => {
      const c = client.db().collection('test');
      await c.dropIndexes().catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`estimatedDocumentCount()`, async () => {
      const c = client.db().collection('test');
      await c.estimatedDocumentCount();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`findOne()`, async () => {
      const c = client.db().collection('test');
      await c.findOne();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`findOneAndDelete()`, async () => {
      const c = client.db().collection('test');
      await c.findOneAndDelete({ a: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`findOneAndReplace()`, async () => {
      const c = client.db().collection('test');
      await c.findOneAndReplace({ a: 1 }, { a: 2 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`findOneAndUpdate()`, async () => {
      const c = client.db().collection('test');
      await c.findOneAndUpdate({ a: 1 }, { $set: { a: 2 } });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`indexes()`, async () => {
      const c = client.db().collection('test');
      await c.indexes().catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`indexExists()`, async () => {
      const c = client.db().collection('test');
      await c.indexExists('a_1').catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`indexInformation()`, async () => {
      const c = client.db().collection('test');
      await c.indexInformation().catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`insert()`, async () => {
      const c = client.db().collection('test');
      // @ts-expect-error: deprecated API
      await c.insert({ a: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`insertMany()`, async () => {
      const c = client.db().collection('test');
      await c.insertMany([{ a: 1 }]);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`insertOne()`, async () => {
      const c = client.db().collection('test');
      await c.insertOne({ a: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`isCapped()`, async () => {
      const c = client.db().collection('test');
      await c.isCapped();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`mapReduce()`, async () => {
      const c = client.db().collection('test');
      await c.mapReduce(
        function () {
          // @ts-expect-error: mapReduce is deprecated
          emit(this.a, [0]);
        },
        function (a, b) {
          // @ts-expect-error: mapReduce is deprecated
          return Array.sum(b);
        },
        { out: 'inline' }
      );
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`options()`, async () => {
      const c = client.db().collection('test');
      await c.options();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`remove()`, async () => {
      const c = client.db().collection('test');
      // @ts-expect-error: deprecated API
      await c.remove({ a: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`rename()`, async () => {
      const c = client.db().collection('test0');
      await c.rename('test1').catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`replaceOne()`, async () => {
      const c = client.db().collection('test');
      await c.replaceOne({ a: 1 }, { a: 2 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`stats()`, async () => {
      const c = client.db().collection('test');
      await c.stats();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`update()`, async () => {
      const c = client.db().collection('test');
      // @ts-expect-error: deprecated API
      await c.update({ a: 1 }, { $set: { a: 2 } });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`updateMany()`, async () => {
      const c = client.db().collection('test');
      await c.updateMany({ a: 1 }, { $set: { a: 2 } });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`updateOne()`, async () => {
      const c = client.db().collection('test');
      await c.updateOne({ a: 1 }, { $set: { a: 2 } });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class Db`, () => {
    it(`addUser()`, async () => {
      const db = client.db();
      const error = await db
        .addUser('neal', 'iLoveJavaScript', { roles: ['dbAdmin'] })
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.not.be.instanceOf(Error);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`collections()`, async () => {
      const db = client.db();
      await db.collections();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`command()`, async () => {
      const db = client.db();
      await db.command({ ping: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`createCollection()`, async () => {
      const db = client.db();
      await db.createCollection('test4');
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`createIndex()`, async () => {
      const db = client.db();
      await db.createIndex('test', { a: 1 });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`dropCollection()`, async () => {
      const db = client.db();
      await db.dropCollection('test');
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`dropDatabase()`, async () => {
      const db = client.db();
      await db.dropDatabase();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`indexInformation()`, async () => {
      const db = client.db();
      const error = await db
        .indexInformation('test')
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.not.be.instanceOf(Error);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`profilingLevel()`, async () => {
      const db = client.db();
      await db.profilingLevel();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`removeUser()`, async () => {
      const db = client.db();
      await db.removeUser('neal').catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`renameCollection()`, async () => {
      const db = client.db();
      const error = await db
        .renameCollection('test0', 'test1')
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.not.be.instanceOf(Error);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`setProfilingLevel()`, async () => {
      const db = client.db();
      await db.setProfilingLevel(ProfilingLevel.off);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`stats()`, async () => {
      const db = client.db();
      await db.stats();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class FindCursor`, () => {
    it(`count()`, async () => {
      const find = client.db().collection('test').find();
      await find.count();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`explain()`, async () => {
      const find = client.db().collection('test').find();
      await find.explain().catch(() => null);
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`close()`, async () => {
      const find = client.db().collection('test').find();
      await find.close();
      expect(client).to.not.have.property('topology');
    });

    it(`forEach()`, async () => {
      const find = client.db().collection('test').find();
      await find.forEach(item => {
        expect(item).to.be.a('object');
      });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`hasNext()`, async () => {
      const find = client.db().collection('test').find();
      await find.hasNext();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`next()`, async () => {
      const find = client.db().collection('test').find();
      await find.next();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`toArray()`, async () => {
      const find = client.db().collection('test').find();
      await find.toArray();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`tryNext()`, async () => {
      const find = client.db().collection('test').find();
      await find.tryNext();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class GridFSBucket`, () => {
    it(`delete()`, async () => {
      const db = client.db('files');
      const bucket = new GridFSBucket(db);
      const error = await bucket
        .delete(new ObjectId())
        .catch(error => (error instanceof MongoRuntimeError ? null : error));
      expect(error).to.be.null;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`drop()`, async () => {
      const db = client.db('files');
      const bucket = new GridFSBucket(db);
      const error = await bucket
        .drop()
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.not.exist;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`rename()`, async () => {
      const db = client.db('files');
      const bucket = new GridFSBucket(db);
      const error = await bucket
        .rename(new ObjectId(), 'new_name.txt')
        .catch(error => (error instanceof MongoRuntimeError ? null : error));
      expect(error).to.be.null;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    context(`class GridFSBucketWriteStream`, () => {
      it(`abort()`, async () => {
        const db = client.db('files');
        const bucket = new GridFSBucket(db);
        const stream = bucket.openUploadStream('neal.txt');
        await stream.abort();
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });

      it(`write()`, async () => {
        const db = client.db('files');
        const bucket = new GridFSBucket(db);
        const stream = bucket.openUploadStream('neal.txt');
        stream.write('hello!');
        stream.end();
        await sleep(1);
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });

    context(`class GridFSBucketReadStream`, () => {
      let utilClient: MongoClient;
      before(async function () {
        utilClient = this.configuration.newClient();
        const bucket = new GridFSBucket(utilClient.db('files'));
        const stream = bucket.openUploadStream('neal.txt');
        const willFinish = once(stream, 'finish');

        const readable = new (class extends Readable {
          _read() {
            // _read is required but you can noop it
          }
        })();
        readable.push(Buffer.from('hello!', 'utf8'));
        readable.push(null);
        readable.pipe(stream);

        await willFinish;
        await utilClient.close();
      });

      it(`read()`, async () => {
        const db = client.db('files');
        const bucket = new GridFSBucket(db);
        const stream = bucket.openDownloadStreamByName('neal.txt');
        await once(stream, 'readable');
        const text = stream.read(6).toString('utf8');
        expect(text).to.equal('hello!');
        expect(client).to.have.property('topology').that.is.instanceOf(Topology);
      });
    });
  });

  context(`class ListCollectionsCursor`, () => {
    it(`forEach()`, async () => {
      const collections = client.db().listCollections();
      await collections.forEach(item => {
        expect(item).is.an('object');
      });
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`hasNext()`, async () => {
      const collections = client.db().listCollections();
      await collections.hasNext();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`next()`, async () => {
      const collections = client.db().listCollections();
      await collections.next();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`toArray()`, async () => {
      const collections = client.db().listCollections();
      await collections.toArray();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`tryNext()`, async () => {
      const collections = client.db().listCollections();
      await collections.tryNext();
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class ListIndexesCursor`, () => {
    it(`forEach()`, async () => {
      const indexes = client.db().collection('test').listIndexes();
      const error = await indexes
        .forEach(item => {
          expect(item).is.an('object');
        })
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.be.null;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`hasNext()`, async () => {
      const indexes = client.db().collection('test').listIndexes();
      const error = await indexes
        .hasNext()
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.be.null;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`next()`, async () => {
      const indexes = client.db().collection('test').listIndexes();
      const error = await indexes
        .next()
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.be.null;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`toArray()`, async () => {
      const indexes = client.db().collection('test').listIndexes();
      const error = await indexes
        .toArray()
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.be.null;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });

    it(`tryNext()`, async () => {
      const indexes = client.db().collection('test').listIndexes();
      const error = await indexes
        .tryNext()
        .catch(error => (error instanceof MongoServerError ? null : error));
      expect(error).to.be.null;
      expect(client).to.have.property('topology').that.is.instanceOf(Topology);
    });
  });

  context(`class MongoClient`, () => {
    it(`withSession()`, async () => {
      await client.withSession(async session => {
        expect(session).to.be.instanceOf(ClientSession);
      });
      expect(client).to.not.have.property('topology'); // withSession won't connect, that's expected
    });
  });
});

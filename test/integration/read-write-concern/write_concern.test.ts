import { expect } from 'chai';
import { on, once } from 'events';
import * as process from 'process';
import * as sinon from 'sinon';

import {
  type Collection,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  type Db,
  MongoClient
} from '../../mongodb';
import { LEGACY_HELLO_COMMAND, OpMsgRequest } from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import { filterForCommands } from '../shared';

describe('Write Concern', function () {
  context('when the WriteConcern is set in the uri', function () {
    let client;
    const events: CommandStartedEvent[] = [];
    beforeEach(function () {
      client = this.configuration.newClient(`${this.configuration.url()}&w=0&monitorCommands=true`);
      client.on('commandStarted', filterForCommands(['insert'], events));
    });
    afterEach(() => client.close());

    it('respects the writeConcern from uri', async function () {
      expect(client.writeConcern).to.deep.equal({ w: 0 });
      const result = await client.db('test').collection('test').insertOne({ a: 1 });
      expect(result).to.exist;
      expect(events).to.be.an('array').with.lengthOf(1);
      expect(events[0]).to.containSubset({
        commandName: 'insert',
        command: {
          writeConcern: { w: 0 }
        }
      });
    });
  });

  describe('mock server write concern test', () => {
    let server;

    before(() => {
      return mock.createServer().then(s => {
        server = s;
      });
    });

    after(() => mock.cleanup());

    it('should pipe writeConcern from client down to API call', function () {
      server.setMessageHandler(request => {
        if (request.document && request.document[LEGACY_HELLO_COMMAND]) {
          return request.reply(mock.HELLO);
        }
        if (request.document && request.document.endSessions) {
          return request.reply({ ok: 1 });
        }
        expect(request.document.writeConcern).to.exist;
        expect(request.document.writeConcern.w).to.equal('majority');
        return request.reply({ ok: 1 });
      });

      const uri = `mongodb://${server.uri()}`;
      const client = new MongoClient(uri, { writeConcern: { w: 'majority' } });
      return client
        .connect()
        .then(() => {
          const db = client.db('wc_test');
          const collection = db.collection('wc');

          return collection.insertMany([{ a: 2 }]);
        })
        .then(() => {
          return client.close();
        });
    });
  });

  context('when performing read operations', function () {
    context('when writeConcern = 0', function () {
      describe('cursor creating operations with a getMore', function () {
        let client: MongoClient;
        let db: Db;
        let col: Collection;

        beforeEach(async function () {
          client = this.configuration.newClient({ writeConcern: { w: 0 } });
          await client.connect();
          db = client.db('writeConcernTest');
          col = db.collection('writeConcernTest');

          const docs = Array.from({ length: 100 }, (_, i) => ({ a: i, b: i + 1 }));
          await col.insertMany(docs);
        });

        afterEach(async function () {
          await db.dropDatabase({ writeConcern: { w: 'majority' } });
          await client.close();
        });

        it('succeeds on find', async function () {
          const findResult = col.find({}, { batchSize: 2 });
          const err = await findResult.toArray().catch(e => e);

          expect(err).to.not.be.instanceOf(Error);
        });

        it('succeeds on listCollections', async function () {
          const collections = Array.from({ length: 10 }, (_, i) => `writeConcernTestCol${i + 1}`);

          await Promise.allSettled(
            collections.map(colName => db.createCollection(colName).catch(() => null))
          );

          const cols = db.listCollections({}, { batchSize: 2 });

          const err = await cols.toArray().catch(e => e);

          expect(err).to.not.be.instanceOf(Error);
        });

        it('succeeds on aggregate', async function () {
          const aggResult = col.aggregate([{ $match: { a: { $gte: 0 } } }], { batchSize: 2 });
          const err = await aggResult.toArray().catch(e => e);

          expect(err).to.not.be.instanceOf(Error);
        });

        it('succeeds on listIndexes', async function () {
          await col.createIndex({ a: 1 });
          await col.createIndex({ b: -1 });
          await col.createIndex({ a: 1, b: -1 });

          const listIndexesResult = col.listIndexes({ batchSize: 2 });
          const err = await listIndexesResult.toArray().catch(e => e);

          expect(err).to.not.be.instanceOf(Error);
        });

        it('succeeds on changeStream', {
          metadata: { requires: { topology: 'replicaset' } },
          async test() {
            const changeStream = col.watch(undefined, { batchSize: 2 });
            const changes = on(changeStream, 'change');
            await once(changeStream['cursor'], 'init');

            await col.insertMany(
              [
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 },
                { a: 10 }
              ],
              { writeConcern: { w: 'majority' } }
            );

            const err = await changes.next().catch(e => e);
            expect(err).to.not.be.instanceOf(Error);
          }
        });
      });
    });
  });

  describe('fire-and-forget protocol', function () {
    const compressionPredicate = () =>
      process.env.COMPRESSOR ? 'Test requires that compression is disabled' : true;
    context('when writeConcern = 0 and OP_MSG is used', function () {
      const writeOperations: { name: string; command: any; expectedReturnVal: any }[] = [
        {
          name: 'insertOne',
          command: client => client.db('test').collection('test').insertOne({ a: 1 }),
          expectedReturnVal: { acknowledged: false }
        },
        {
          name: 'insertMany',
          command: client =>
            client
              .db('test')
              .collection('test')
              .insertMany([{ a: 1 }, { b: 2 }]),
          expectedReturnVal: { acknowledged: false }
        },
        {
          name: 'updateOne',
          command: client =>
            client
              .db('test')
              .collection('test')
              .updateOne({ i: 128 }, { $set: { c: 2 } }),
          expectedReturnVal: { acknowledged: false }
        },
        {
          name: 'updateMany',
          command: client =>
            client
              .db('test')
              .collection('test')
              .updateMany({ name: 'foobar' }, { $set: { name: 'fizzbuzz' } }),
          expectedReturnVal: { acknowledged: false }
        },
        {
          name: 'deleteOne',
          command: client => client.db('test').collection('test').deleteOne({ a: 1 }),
          expectedReturnVal: { acknowledged: false }
        },
        {
          name: 'deleteMany',
          command: client => client.db('test').collection('test').deleteMany({ name: 'foobar' }),
          expectedReturnVal: { acknowledged: false }
        },
        {
          name: 'replaceOne',
          command: client => client.db('test').collection('test').replaceOne({ a: 1 }, { b: 2 }),
          expectedReturnVal: { acknowledged: false }
        },
        {
          name: 'removeUser',
          command: client => client.db('test').removeUser('albert'),
          expectedReturnVal: true
        },
        {
          name: 'findAndModify',
          command: client =>
            client
              .db('test')
              .collection('test')
              .findOneAndUpdate({}, { $setOnInsert: { a: 1 } }, { upsert: true }),
          expectedReturnVal: null
        },
        {
          name: 'dropDatabase',
          command: client => client.db('test').dropDatabase(),
          expectedReturnVal: true
        },
        {
          name: 'dropCollection',
          command: client => client.db('test').dropCollection('test'),
          expectedReturnVal: true
        },
        {
          name: 'dropIndexes',
          command: client => client.db('test').collection('test').dropIndex('a'),
          expectedReturnVal: { ok: 1 }
        },
        {
          name: 'createIndexes',
          command: client => client.db('test').collection('test').createIndex({ a: 1 }),
          expectedReturnVal: 'a_1'
        },
        {
          name: 'createCollection',
          command: client => client.db('test').createCollection('test'),
          expectedReturnVal: {}
        }
      ];

      for (const op of writeOperations) {
        context(`when the write operation ${op.name} is run`, function () {
          let client;
          let spy;

          beforeEach(async function () {
            spy = sinon.spy(OpMsgRequest.prototype, 'toBin');
            client = this.configuration.newClient({ monitorCommands: true, w: 0 });
            await client.connect();
          });

          afterEach(async function () {
            sinon.restore();
            await client.close();
          });

          it(
            'the request should have moreToCome bit set',
            { requires: { predicate: compressionPredicate } },
            async function () {
              await op.command(client);
              expect(spy.returnValues[spy.returnValues.length - 1][0][16]).to.equal(2);
            }
          );

          it(
            'the return value of the command should be nullish',
            { requires: { predicate: compressionPredicate } },
            async function () {
              const result = await op.command(client);
              expect(result).to.containSubset(op.expectedReturnVal);
            }
          );

          it(
            'commandSucceededEvent should have reply with only {ok: 1}',
            { requires: { predicate: compressionPredicate } },
            async function () {
              const events: CommandSucceededEvent[] = [];
              client.on('commandSucceeded', event => events.push(event));
              await op.command(client);
              expect(events[0]).to.containSubset({ reply: { ok: 1 } });
            }
          );
        });
      }
    });
  });

  describe('NODE-6763: write concern is still added with timeoutMS is set', function () {
    let client: MongoClient;
    let collection: Collection;
    const commands: CommandStartedEvent[] = [];

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      client.on('commandStarted', filterForCommands('insert', commands));
      collection = client.db('foo').collection('bar');
    });

    afterEach(async function () {
      await client.close();
      commands.length = 0;
    });

    context('when the write concern includes only timeouts', function () {
      it('the writeConcern is not added to the command.', async function () {
        await collection.insertOne(
          { name: 'john doe' },
          { timeoutMS: 1000, writeConcern: { wtimeout: 1000 } }
        );
        const [
          {
            command: { writeConcern }
          }
        ] = commands;
        expect(writeConcern).not.to.exist;
      });
    });

    context('when the write concern includes only non-timeout values (`w`)', function () {
      it('the writeConcern is added to the command.', async function () {
        await collection.insertOne(
          { name: 'john doe' },
          { timeoutMS: 1000, writeConcern: { wtimeout: 1000, w: 'majority' } }
        );
        const [
          {
            command: { writeConcern }
          }
        ] = commands;
        expect(writeConcern).to.deep.equal({ w: 'majority' });
      });
    });
  });
});

import { expect } from 'chai';
import { on, once } from 'events';

import { Collection } from '../../../src/collection';
import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import { Db } from '../../../src/db';
import { MongoClient } from '../../../src/mongo_client';
import * as mock from '../../tools/mongodb-mock/index';

describe('Write Concern', function () {
  it('should respect writeConcern from uri', function (done) {
    const client = this.configuration.newClient(
      `${this.configuration.url()}&w=0&monitorCommands=true`
    );
    const events: any[] = [];
    client.on('commandStarted', event => {
      if (event.commandName === 'insert') {
        events.push(event);
      }
    });

    expect(client.writeConcern).to.eql({ w: 0 });
    client
      .db('test')
      .collection('test')
      .insertOne({ a: 1 }, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        expect(events).to.be.an('array').with.lengthOf(1);
        expect(events[0]).to.containSubset({
          commandName: 'insert',
          command: {
            writeConcern: { w: 0 }
          }
        });
        client.close(done);
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

    // TODO(NODE-3816): the mock server response is looking for writeConcern on all messages, but endSessions doesn't have it
    it.skip('should pipe writeConcern from client down to API call', function () {
      server.setMessageHandler(request => {
        if (request.document && request.document[LEGACY_HELLO_COMMAND]) {
          return request.reply(mock.HELLO);
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

          const docs: any[] = [];
          for (let i = 0; i < 100; i++) {
            docs.push({ a: i, b: i + 1 });
          }

          await col.insertMany(docs);
        });

        afterEach(async function () {
          await db.dropDatabase();
          await client.close();
        });

        it('succeeds on find', async function () {
          const findResult = col.find({}, { batchSize: 2 });
          const err = await findResult.toArray().catch(e => e);

          expect(err).to.not.be.instanceOf(Error);
        });

        it('succeeds on listCollections', async function () {
          const collections: any[] = [];
          for (let i = 0; i < 10; i++) {
            collections.push(`writeConcernTestCol${i + 1}`);
          }

          for (const colName of collections) {
            await db.createCollection(colName).catch(() => null);
          }

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
            await once(changeStream.cursor, 'init');

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
});

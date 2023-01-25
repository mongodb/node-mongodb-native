const { expect } = require('chai');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');

const mock = require('../../tools/mongodb-mock/index');
const { MongoClient, Collection, Db } = require('../../../src');

describe('Write Concern', function() {
  it('should respect writeConcern from uri', function(done) {
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

    // TODO: NODE-3816
    it.skip('should pipe writeConcern from client down to API call', function() {
      server.setMessageHandler(request => {
        if (request.document && request.document[LEGACY_HELLO_COMMAND]) {
          return request.reply(mock.HELLO);
        }
        expect(request.document.writeConcern).to.exist;
        expect(request.document.writeConcern.w).to.equal('majority');
        return request.reply({ ok: 1 });
      });

      const uri = `mongodb://${server.uri()}`;
      const client = new MongoClient(uri, { writeConcern: 'majority' });
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

  describe('must not affect read operations', function() {
    let client: typeof MongoClient;
    let db: typeof Db;
    let col: typeof Collection;

    beforeEach(async function() {
      client = this.configuration.newClient({ 'writeConcern': { w: 0 } });
      await client.connect();
      db = client.db('test');
      await db.dropCollection('writeConcernTest').catch(() => null);
      col = db.collection('writeConcernTest');

      const docs: any[] = [];
      for (let i = 0; i < 1028; i++) {
        docs.push({ a: i });
      }

      await col.insertMany(docs);
    });

    afterEach(async function() {
      await client.close();
    });

    describe('when writeConcern=0', function() {
      it('does not throw an error when getMore is called on cursor', async function() {
        const findResult = col.find({});
        let err;

        await findResult.toArray()
          .catch(e => {
            err = e;
          });
        expect(err).to.not.exist;
      });
    });
  });
});

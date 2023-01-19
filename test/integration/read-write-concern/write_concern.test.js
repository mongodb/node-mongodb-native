'use strict';

const { expect } = require('chai');
const { LEGACY_HELLO_COMMAND } = require('../../mongodb');

const mock = require('../../tools/mongodb-mock/index');
const { MongoClient } = require('../../mongodb');

describe('Write Concern', function () {
  it('should respect writeConcern from uri', function (done) {
    const client = this.configuration.newClient(
      `${this.configuration.url()}&w=0&monitorCommands=true`
    );
    const events = [];
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
});

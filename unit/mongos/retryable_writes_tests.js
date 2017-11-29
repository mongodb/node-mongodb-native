'use strict';
var expect = require('chai').expect,
  Mongos = require('../../../../lib/topologies/mongos'),
  mock = require('../../../mock'),
  MongosFixture = require('../common').MongosFixture,
  ClientSession = require('../../../../lib/sessions').ClientSession,
  ServerSessionPool = require('../../../../lib/sessions').ServerSessionPool;

const test = new MongosFixture();
describe('Retryable Writes (Mongos)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup({ ismaster: mock.DEFAULT_ISMASTER_36 }));

  it('should add `txnNumber` to write commands where `retryWrites` is true', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      const topology = new Mongos(test.servers.map(server => server.address()), {
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 10000,
        localThresholdMS: 500,
        size: 1
      });

      const sessionPool = new ServerSessionPool(topology);
      const session = new ClientSession(topology, sessionPool);

      let command = null;
      const messageHandler = () => {
        return request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(test.defaultFields);
          } else if (doc.insert) {
            command = doc;
            request.reply({ ok: 1 });
          }
        };
      };

      test.servers[0].setMessageHandler(messageHandler('MONGOS1'));
      test.servers[1].setMessageHandler(messageHandler('MONGOS2'));

      topology.once('fullsetup', function() {
        topology.insert('test.test', [{ a: 1 }], { retryWrites: true, session: session }, function(
          err
        ) {
          expect(err).to.not.exist;
          expect(command).to.have.property('txnNumber');
          expect(command.txnNumber).to.eql(1);

          topology.destroy();
          done();
        });
      });

      topology.on('error', done);
      topology.connect();
    }
  });

  it('should retry write commands where `retryWrites` is true, and not increment `txnNumber`', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      const mongos = new Mongos(test.servers.map(server => server.address()), {
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 10000,
        localThresholdMS: 500,
        size: 1
      });

      const sessionPool = new ServerSessionPool(mongos);
      const session = new ClientSession(mongos, sessionPool);

      let command = null,
        insertCount = 0;

      const messageHandler = () => {
        return request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(test.defaultFields);
          } else if (doc.insert) {
            insertCount++;
            if (insertCount === 1) {
              request.connection.destroy();
            } else {
              command = doc;
              request.reply({ ok: 1 });
            }
          }
        };
      };

      test.servers[0].setMessageHandler(messageHandler('MONGOS1'));
      test.servers[1].setMessageHandler(messageHandler('MONGOS2'));
      mongos.once('fullsetup', function() {
        mongos.insert('test.test', [{ a: 1 }], { retryWrites: true, session: session }, function(
          err
        ) {
          if (err) console.dir(err);
          expect(err).to.not.exist;
          expect(command).to.have.property('txnNumber');
          expect(command.txnNumber).to.eql(1);

          mongos.destroy();
          done();
        });
      });

      mongos.on('error', done);
      mongos.connect();
    }
  });
});

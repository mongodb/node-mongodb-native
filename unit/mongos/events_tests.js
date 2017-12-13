'use strict';

const expect = require('chai').expect;
const Mongos = require('../../../../lib/topologies/mongos');
const mock = require('../../../mock');
const MongosFixture = require('../common').MongosFixture;

const test = new MongosFixture();

describe('EventEmitters (Mongos)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should remove `serverDescriptionChanged` listeners when server is closed', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      test.server.setMessageHandler(req => {
        const doc = req.document;
        if (doc.ismaster) {
          req.reply(Object.assign({}, test.defaultFields));
        }
      });

      const mongos = new Mongos([test.server.address()], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.disconnectedProxies).to.have.length(1);
        expect(mongos.disconnectedProxies[0].listenerCount('serverDescriptionChanged')).to.equal(1);
        // After we connect, destroy/close the server
        mongos.destroy();
        mongos.on('topologyClosed', () => {
          expect(mongos.disconnectedProxies).to.have.length(1);
          expect(mongos.disconnectedProxies[0].listenerCount('serverDescriptionChanged')).to.equal(
            0
          );
        });

        done();
      });

      mongos.connect();
    }
  });
});

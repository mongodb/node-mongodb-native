'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');

describe('Client (unit)', function() {
  let server;

  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(_server => (server = _server));
  });

  it('should let wrapping libraries amend the client metadata', function() {
    let handshake;
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        handshake = doc;
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    const client = this.configuration.newClient(`mongodb://${server.uri()}/`, {
      useUnifiedTopology: true,
      driverInfo: {
        name: 'mongoose',
        version: '5.7.10',
        platform: 'llama edition'
      }
    });

    return client.connect().then(() => {
      this.defer(() => client.close());

      expect(handshake)
        .nested.property('client.driver')
        .to.deep.equal({
          name: 'nodejs|mongoose',
          version: '3.3.4|5.7.10'
        });

      expect(handshake)
        .nested.property('client.platform')
        .to.match(/llama edition/);
    });
  });
});

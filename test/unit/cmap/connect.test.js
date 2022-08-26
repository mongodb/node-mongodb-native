'use strict';

const mock = require('../../tools/mongodb-mock/index');
const { expect } = require('chai');
const EventEmitter = require('events');
const { setTimeout } = require('timers');

const {
  connect,
  prepareHandshakeDocument: prepareHandshakeDocumentCb
} = require('../../../src/cmap/connect');
const { MongoCredentials } = require('../../../src/cmap/auth/mongo_credentials');
const { genClusterTime } = require('../../tools/common');
const { MongoNetworkError } = require('../../../src/error');
const { HostAddress, isHello } = require('../../../src/utils');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');
const { promisify } = require('util');

describe('Connect Tests', function () {
  const test = {};
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
      test.connectOptions = {
        hostAddress: test.server.hostAddress(),
        credentials: new MongoCredentials({
          username: 'testUser',
          password: 'pencil',
          source: 'admin',
          mechanism: 'PLAIN'
        })
      };
    });
  });

  afterEach(() => mock.cleanup());
  it('should auth against a non-arbiter', function (done) {
    const whatHappened = {};

    test.server.setMessageHandler(request => {
      const doc = request.document;
      const $clusterTime = genClusterTime(Date.now());

      if (isHello(doc)) {
        whatHappened[LEGACY_HELLO_COMMAND] = true;
        request.reply(
          Object.assign({}, mock.HELLO, {
            $clusterTime
          })
        );
      } else if (doc.saslStart) {
        whatHappened.saslStart = true;
        request.reply({ ok: 1 });
      }
    });

    connect(test.connectOptions, err => {
      try {
        expect(whatHappened).to.have.property(LEGACY_HELLO_COMMAND, true);
        expect(whatHappened).to.have.property('saslStart', true);
      } catch (_err) {
        err = _err;
      }

      done(err);
    });
  });

  it('should not auth against an arbiter', function (done) {
    const whatHappened = {};
    test.server.setMessageHandler(request => {
      const doc = request.document;
      const $clusterTime = genClusterTime(Date.now());
      if (isHello(doc)) {
        whatHappened[LEGACY_HELLO_COMMAND] = true;
        request.reply(
          Object.assign({}, mock.HELLO, {
            $clusterTime,
            arbiterOnly: true
          })
        );
      } else if (doc.saslStart) {
        whatHappened.saslStart = true;
        request.reply({ ok: 0 });
      }
    });

    connect(test.connectOptions, err => {
      try {
        expect(whatHappened).to.have.property(LEGACY_HELLO_COMMAND, true);
        expect(whatHappened).to.not.have.property('saslStart');
      } catch (_err) {
        err = _err;
      }

      done(err);
    });
  });

  it('should emit `MongoNetworkError` for network errors', function (done) {
    connect({ hostAddress: new HostAddress('non-existent:27018') }, err => {
      expect(err).to.be.instanceOf(MongoNetworkError);
      done();
    });
  });

  it.skip('should allow a cancellaton token', function (done) {
    const cancellationToken = new EventEmitter();
    setTimeout(() => cancellationToken.emit('cancel'), 500);
    // set no response handler for mock server, effecively blackhole requests

    connect({ hostAddress: new HostAddress('240.0.0.1'), cancellationToken }, (err, conn) => {
      expect(err).to.exist;
      expect(err).to.match(/connection establishment was cancelled/);
      expect(conn).to.not.exist;
      done();
    });
  }).skipReason = 'TODO(NODE-2941): stop using 240.0.0.1 in tests';

  context('prepareHandshakeDocument', () => {
    const prepareHandshakeDocument = promisify(prepareHandshakeDocumentCb);

    context('loadBalanced option', () => {
      context('when loadBalanced is not set as an option', () => {
        it('does not set loadBalanced on the handshake document', async () => {
          const options = {};
          const authContext = {
            connection: {},
            options
          };
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).not.to.have.property('loadBalanced');
        });
      });

      context('when loadBalanced is set to false', () => {
        it('does not set loadBalanced on the handshake document', async () => {
          const options = {
            loadBalanced: false
          };
          const authContext = {
            connection: {},
            options
          };
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).not.to.have.property('loadBalanced');
        });
      });

      context('when loadBalanced is set to true', () => {
        it('does set loadBalanced on the handshake document', async () => {
          const options = {
            loadBalanced: true
          };
          const authContext = {
            connection: {},
            options
          };
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).to.have.property('loadBalanced', true);
        });
      });
    });
  });
});

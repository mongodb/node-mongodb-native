import { expect } from 'chai';

import {
  CancellationToken,
  type ClientMetadata,
  connect,
  type Connection,
  type ConnectionOptions,
  HostAddress,
  isHello,
  LEGACY_HELLO_COMMAND,
  MongoClientAuthProviders,
  MongoCredentials,
  MongoNetworkError,
  prepareHandshakeDocument
} from '../../mongodb';
import { genClusterTime } from '../../tools/common';
import * as mock from '../../tools/mongodb-mock/index';

const CONNECT_DEFAULTS = {
  id: 1,
  tls: false,
  generation: 1,
  monitorCommands: false,
  metadata: {} as ClientMetadata,
  loadBalanced: false
};

describe('Connect Tests', function () {
  context('when PLAIN auth enabled', () => {
    const test: {
      server?: any;
      connectOptions?: ConnectionOptions;
    } = {};

    beforeEach(async () => {
      const mockServer = await mock.createServer();
      test.server = mockServer;
      test.connectOptions = {
        ...CONNECT_DEFAULTS,
        hostAddress: test.server.hostAddress() as HostAddress,
        credentials: new MongoCredentials({
          username: 'testUser',
          password: 'pencil',
          source: 'admin',
          mechanism: 'PLAIN',
          mechanismProperties: {}
        }),
        authProviders: new MongoClientAuthProviders()
      };
    });

    afterEach(() => mock.cleanup());

    it('should auth against a non-arbiter', async function () {
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

      await connect(test.connectOptions);

      expect(whatHappened).to.have.property(LEGACY_HELLO_COMMAND, true);
      expect(whatHappened).to.have.property('saslStart', true);
    });

    it('should not auth against an arbiter', async function () {
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

      await connect(test.connectOptions);

      expect(whatHappened).to.have.property(LEGACY_HELLO_COMMAND, true);
      expect(whatHappened).to.not.have.property('saslStart');
    });
  });

  context('when creating a connection', () => {
    let server;
    let connectOptions;
    let connection: Connection;

    beforeEach(async () => {
      server = await mock.createServer();
      server.setMessageHandler(request => {
        if (isHello(request.document)) {
          request.reply(mock.HELLO);
        }
      });
      connectOptions = {
        ...CONNECT_DEFAULTS,
        hostAddress: server.hostAddress() as HostAddress,
        socketTimeoutMS: 15000
      };

      connection = await connect(connectOptions);
    });

    afterEach(async () => {
      connection.destroy({ force: true });
      await mock.cleanup();
    });

    it('creates a connection with an infinite timeout', async () => {
      // @ts-expect-error: accessing private property
      expect(connection.socket).to.have.property('timeout', 0);
    });

    it('connection instance has property socketTimeoutMS equal to the value passed in the connectOptions', async () => {
      expect(connection).to.have.property('socketTimeoutMS', 15000);
    });

    context('when the provided cancellation token emits cancel', () => {
      it('interrupts the connection with an error', async () => {
        // set no response handler for mock server, effectively black hole requests
        server.setMessageHandler(() => null);

        const cancellationToken = new CancellationToken();
        // Make sure the cancel listener is added before emitting cancel
        cancellationToken.addListener('newListener', () => {
          process.nextTick(() => {
            cancellationToken.emit('cancel');
          });
        });

        const error = await connect({
          ...connectOptions,
          // Ensure these timeouts do not fire first
          socketTimeoutMS: 5000,
          connectTimeoutMS: 5000,
          cancellationToken
        }).catch(error => error);

        expect(error, error.stack).to.match(/connection establishment was cancelled/);
      });
    });

    context('when connecting takes longer than connectTimeoutMS', () => {
      it('interrupts the connection with an error', async () => {
        // set no response handler for mock server, effectively black hole requests
        server.setMessageHandler(() => null);

        const error = await connect({ ...connectOptions, connectTimeoutMS: 5 }).catch(
          error => error
        );

        expect(error).to.match(/timed out/);
      });
    });
  });

  it('should emit `MongoNetworkError` for network errors', async function () {
    const error = await connect({
      hostAddress: new HostAddress('non-existent:27018')
    }).catch(e => e);
    expect(error).to.be.instanceOf(MongoNetworkError);
  });

  context('prepareHandshakeDocument', () => {
    context('when serverApi.version is present', () => {
      const options = {};
      const authContext = {
        connection: { serverApi: { version: '1' } },
        options
      };

      it('sets the hello parameter to 1', async () => {
        const handshakeDocument = await prepareHandshakeDocument(authContext);
        expect(handshakeDocument).to.have.property('hello', 1);
      });
    });

    context('when serverApi is not present', () => {
      const options = {};
      const authContext = {
        connection: {},
        options
      };

      it('sets the legacy hello parameter to 1', async () => {
        const handshakeDocument = await prepareHandshakeDocument(authContext);
        expect(handshakeDocument).to.have.property(LEGACY_HELLO_COMMAND, 1);
      });
    });

    context('loadBalanced option', () => {
      context('when loadBalanced is not set as an option', () => {
        const authContext = {
          connection: {},
          options: {}
        };

        it('does not set loadBalanced on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).not.to.have.property('loadBalanced');
        });

        it('does not set hello on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).not.to.have.property('hello');
        });

        it('sets LEGACY_HELLO_COMMAND on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).to.have.property(LEGACY_HELLO_COMMAND, 1);
        });
      });

      context('when loadBalanced is set to false', () => {
        const authContext = {
          connection: {},
          options: { loadBalanced: false }
        };

        it('does not set loadBalanced on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).not.to.have.property('loadBalanced');
        });

        it('does not set hello on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).not.to.have.property('hello');
        });

        it('sets LEGACY_HELLO_COMMAND on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).to.have.property(LEGACY_HELLO_COMMAND, 1);
        });
      });

      context('when loadBalanced is set to true', () => {
        const authContext = {
          connection: {},
          options: { loadBalanced: true }
        };

        it('sets loadBalanced on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).to.have.property('loadBalanced');
        });

        it('sets hello on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).to.have.property('hello');
        });

        it('does not set LEGACY_HELLO_COMMAND on the handshake document', async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument).not.have.property(LEGACY_HELLO_COMMAND, 1);
        });
      });
    });
  });
});

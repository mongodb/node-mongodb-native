import { expect } from 'chai';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as process from 'process';
import * as sinon from 'sinon';
import * as tls from 'tls';

import { MongoCredentials } from '../../../src/cmap/auth/mongo_credentials';
import {
  connect,
  DEFAULT_KEEP_ALIVE_INITIAL_DELAY_MS,
  makeSocket,
  prepareHandshakeDocument
} from '../../../src/cmap/connect';
import { type Connection, type ConnectionOptions } from '../../../src/cmap/connection';
import {
  type ClientMetadata,
  makeClientMetadata
} from '../../../src/cmap/handshake/client_metadata';
import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import { MongoNetworkError } from '../../../src/error';
import { MongoClientAuthProviders } from '../../../src/mongo_client_auth_providers';
import { CancellationToken } from '../../../src/mongo_types';
import { HostAddress, isHello } from '../../../src/utils';
import { genClusterTime } from '../../tools/common';
import * as mock from '../../tools/mongodb-mock/index';

const CONNECT_DEFAULTS = {
  id: 1,
  tls: false,
  generation: 1,
  monitorCommands: false,
  metadata: Promise.resolve({} as ClientMetadata),
  loadBalanced: false
};

function configureMockEnvHooks(env: NodeJS.ProcessEnv) {
  const cachedEnv = process.env;

  beforeEach(function () {
    process.env = env;
  });

  afterEach(function () {
    process.env = cachedEnv;
  });
}

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
      connection.destroy();
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
          queueMicrotask(() => {
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

  describe('prepareHandshakeDocument', () => {
    describe('client environment (containers and FAAS)', () => {
      context('when only kubernetes is present', () => {
        let authContext;

        configureMockEnvHooks({
          KUBERNETES_SERVICE_HOST: 'I exist'
        });

        beforeEach(() => {
          authContext = {
            connection: {},
            options: {
              ...CONNECT_DEFAULTS,
              metadata: makeClientMetadata([], {})
            }
          };
        });

        afterEach(() => {
          authContext = {};
        });

        it(`should include { orchestrator: 'kubernetes'} in client.env.container`, async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument.client.env.container.orchestrator).to.equal('kubernetes');
        });

        it(`should not have 'name' property in client.env `, async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument.client.env).to.not.have.property('name');
        });

        context('when 512 byte size limit is exceeded', () => {
          it(`should not 'env' property in client`, async () => {
            // make a metadata object that, with just the name and appName, is already at capacity.
            const longAppName = 's'.repeat(493);
            const metadata = makeClientMetadata(
              [
                {
                  name: 's'.repeat(128)
                }
              ],
              { appName: longAppName }
            );
            const longAuthContext = {
              connection: {},
              options: {
                ...CONNECT_DEFAULTS,
                metadata
              }
            };
            const handshakeDocument = await prepareHandshakeDocument(longAuthContext);
            expect(handshakeDocument.client).to.not.have.property('env');
          });
        });
      });

      context('when kubernetes and FAAS are both present', () => {
        let authContext;

        configureMockEnvHooks({
          KUBERNETES_SERVICE_HOST: 'I exist',
          AWS_EXECUTION_ENV: 'AWS_Lambda_function'
        });

        beforeEach(() => {
          authContext = {
            connection: {},
            options: {
              ...CONNECT_DEFAULTS,
              metadata: makeClientMetadata([], {})
            }
          };
        });

        afterEach(() => {
          authContext = {};
        });

        it(`should include { orchestrator: 'kubernetes'} in client.env.container`, async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument.client.env.container.orchestrator).to.equal('kubernetes');
        });

        it(`should still have properly set 'name' property in client.env `, async () => {
          const handshakeDocument = await prepareHandshakeDocument(authContext);
          expect(handshakeDocument.client.env.name).to.equal('aws.lambda');
        });

        context('when 512 byte size limit is exceeded', () => {
          it(`should not have 'container' property in client.env`, async () => {
            const longAppName = 's'.repeat(447);
            // make a metadata object that, with just the name and appName, is already at capacity.
            const metadata = makeClientMetadata(
              [
                {
                  name: 's'.repeat(128)
                }
              ],
              { appName: longAppName }
            );
            const longAuthContext = {
              connection: {},
              options: {
                ...CONNECT_DEFAULTS,
                metadata
              }
            };
            const handshakeDocument = await prepareHandshakeDocument(longAuthContext);
            expect(handshakeDocument.client.env.name).to.equal('aws.lambda');
            expect(handshakeDocument.client.env).to.not.have.property('container');
          });
        });
      });

      context('when container nor FAAS env is not present (empty string case)', () => {
        const authContext = {
          connection: {},
          options: { ...CONNECT_DEFAULTS }
        };

        context('when process.env.KUBERNETES_SERVICE_HOST = undefined', () => {
          configureMockEnvHooks({ KUBERNETES_SERVICE_HOST: undefined });

          it(`should not have 'env' property in client`, async () => {
            const handshakeDocument = await prepareHandshakeDocument(authContext);
            expect(handshakeDocument.client).to.not.have.property('env');
          });
        });

        context('when process.env.KUBERNETES_SERVICE_HOST is an empty string', () => {
          configureMockEnvHooks({
            KUBERNETES_SERVICE_HOST: ''
          });

          it(`should not have 'env' property in client`, async () => {
            const handshakeDocument = await prepareHandshakeDocument(authContext);
            expect(handshakeDocument.client).to.not.have.property('env');
          });
        });
      });
    });

    context('when serverApi.version is present', () => {
      const options = { ...CONNECT_DEFAULTS };
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
      const options = { ...CONNECT_DEFAULTS };
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
          options: { ...CONNECT_DEFAULTS }
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
          options: { ...CONNECT_DEFAULTS, loadBalanced: false }
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
          options: { ...CONNECT_DEFAULTS, loadBalanced: true }
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

  describe('makeSocket', function () {
    let tlsServer: tls.Server;
    let tlsPort: number;
    let setKeepAliveSpy: sinon.SinonSpy;
    let setNoDelaySpy: sinon.SinonSpy;

    const serverPem = fs.readFileSync(
      path.join(__dirname, '../../integration/auth/ssl/server.pem')
    );

    before(function (done) {
      // @SECLEVEL=0 allows the legacy test certificate (signed with SHA-1/1024-bit RSA)
      // to be accepted by OpenSSL 3.x, which rejects at the default security level.
      tlsServer = tls.createServer(
        { key: serverPem, cert: serverPem, ciphers: 'DEFAULT:@SECLEVEL=0' },
        () => {
          /* empty */
        }
      );
      tlsServer.listen(0, '127.0.0.1', () => {
        tlsPort = (tlsServer.address() as net.AddressInfo).port;
        done();
      });
    });

    after(function () {
      tlsServer?.close();
    });

    beforeEach(function () {
      setKeepAliveSpy = sinon.spy(net.Socket.prototype, 'setKeepAlive');
      setNoDelaySpy = sinon.spy(net.Socket.prototype, 'setNoDelay');
    });

    afterEach(function () {
      sinon.restore();
    });

    context('when tls is enabled', function () {
      it('calls setKeepAlive with default keepAliveInitialDelay', async function () {
        const socket = await makeSocket({
          hostAddress: new HostAddress(`127.0.0.1:${tlsPort}`),
          tls: true,
          rejectUnauthorized: false,
          ciphers: 'DEFAULT:@SECLEVEL=0'
        } as ConnectionOptions);
        socket.destroy();

        expect(setKeepAliveSpy).to.have.been.calledWith(true, DEFAULT_KEEP_ALIVE_INITIAL_DELAY_MS);
      });

      it('calls setKeepAlive with custom keepAliveInitialDelay', async function () {
        const socket = await makeSocket({
          hostAddress: new HostAddress(`127.0.0.1:${tlsPort}`),
          tls: true,
          rejectUnauthorized: false,
          ciphers: 'DEFAULT:@SECLEVEL=0',
          keepAliveInitialDelay: 5000
        } as ConnectionOptions);
        socket.destroy();

        expect(setKeepAliveSpy).to.have.been.calledWith(true, 5000);
      });

      it('calls setNoDelay with true by default', async function () {
        const socket = await makeSocket({
          hostAddress: new HostAddress(`127.0.0.1:${tlsPort}`),
          tls: true,
          rejectUnauthorized: false,
          ciphers: 'DEFAULT:@SECLEVEL=0'
        } as ConnectionOptions);
        socket.destroy();

        expect(setNoDelaySpy).to.have.been.calledWith(true);
      });
    });

    context('when tls is disabled', function () {
      it('calls setKeepAlive with default keepAliveInitialDelay', async function () {
        const socket = await makeSocket({
          hostAddress: new HostAddress(`127.0.0.1:${tlsPort}`),
          tls: false
        } as ConnectionOptions);
        socket.destroy();

        expect(setKeepAliveSpy).to.have.been.calledWith(true, DEFAULT_KEEP_ALIVE_INITIAL_DELAY_MS);
      });

      it('calls setNoDelay with true by default', async function () {
        const socket = await makeSocket({
          hostAddress: new HostAddress(`127.0.0.1:${tlsPort}`),
          tls: false
        } as ConnectionOptions);
        socket.destroy();

        expect(setNoDelaySpy).to.have.been.calledWith(true);
      });
    });
  });
});

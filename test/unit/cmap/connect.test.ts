
import { type Document } from 'bson';
import { expect } from 'chai';

import { MongoCredentials } from '../../../src/cmap/auth/mongo_credentials';
import { connect, prepareHandshakeDocument } from '../../../src/cmap/connect';
import { ConnectionOptions, type Connection } from '../../../src/cmap/connection';
import {
  addContainerMetadata,
  type ClientMetadata
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
  metadata: {} as ClientMetadata,
  extendedMetadata: addContainerMetadata({} as ClientMetadata),
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


  describe('prepareHandshakeDocument', () => {
    describe('client environment (containers and FAAS)', () => {
      const cachedEnv = process.env;

      context('when only kubernetes is present', () => {
        let authContext;

        beforeEach(() => {
          process.env.KUBERNETES_SERVICE_HOST = 'I exist';
          authContext = {
            connection: {},
            options: {
              ...CONNECT_DEFAULTS,
              extendedMetadata: addContainerMetadata({} as ClientMetadata)
            }
          };
        });

        afterEach(() => {
          if (cachedEnv.KUBERNETES_SERVICE_HOST != null) {
            process.env.KUBERNETES_SERVICE_HOST = cachedEnv.KUBERNETES_SERVICE_HOST;
          } else {
            delete process.env.KUBERNETES_SERVICE_HOST;
          }
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
            // make metadata = 507 bytes, so it takes up entire LimitedSizeDocument
            const longAppName = 's'.repeat(493);
            const longAuthContext = {
              connection: {},
              options: {
                ...CONNECT_DEFAULTS,
                extendedMetadata: addContainerMetadata({ appName: longAppName })
              }
            };
            const handshakeDocument = await prepareHandshakeDocument(longAuthContext);
            expect(handshakeDocument.client).to.not.have.property('env');
          });
        });
      });

      context('when kubernetes and FAAS are both present', () => {
        let authContext;

        beforeEach(() => {
          process.env.KUBERNETES_SERVICE_HOST = 'I exist';
          authContext = {
            connection: {},
            options: {
              ...CONNECT_DEFAULTS,
              extendedMetadata: addContainerMetadata({ env: { name: 'aws.lambda' } })
            }
          };
        });

        afterEach(() => {
          if (cachedEnv.KUBERNETES_SERVICE_HOST != null) {
            process.env.KUBERNETES_SERVICE_HOST = cachedEnv.KUBERNETES_SERVICE_HOST;
          } else {
            delete process.env.KUBERNETES_SERVICE_HOST;
          }
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
            // make metadata = 507 bytes, so it takes up entire LimitedSizeDocument
            const longAppName = 's'.repeat(447);
            const longAuthContext = {
              connection: {},
              options: {
                ...CONNECT_DEFAULTS,
                extendedMetadata: {
                  appName: longAppName,
                  env: { name: 'aws.lambda' }
                } as unknown as Promise<Document>
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
          beforeEach(() => {
            delete process.env.KUBERNETES_SERVICE_HOST;
          });

          afterEach(() => {
            afterEach(() => {
              if (cachedEnv.KUBERNETES_SERVICE_HOST != null) {
                process.env.KUBERNETES_SERVICE_HOST = cachedEnv.KUBERNETES_SERVICE_HOST;
              } else {
                delete process.env.KUBERNETES_SERVICE_HOST;
              }
            });
          });

          it(`should not have 'env' property in client`, async () => {
            const handshakeDocument = await prepareHandshakeDocument(authContext);
            expect(handshakeDocument.client).to.not.have.property('env');
          });
        });

        context('when process.env.KUBERNETES_SERVICE_HOST is an empty string', () => {
          beforeEach(() => {
            process.env.KUBERNETES_SERVICE_HOST = '';
          });

          afterEach(() => {
            if (cachedEnv.KUBERNETES_SERVICE_HOST != null) {
              process.env.KUBERNETES_SERVICE_HOST = cachedEnv.KUBERNETES_SERVICE_HOST;
            } else {
              delete process.env.KUBERNETES_SERVICE_HOST;
            }
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
});

import { expect } from 'chai';
import * as os from 'os';
import * as sinon from 'sinon';

import {
  AUTH_PROVIDERS,
  AuthHandshakeDecorator,
  AuthMechanism,
  Connection,
  HostAddress,
  MongoCredentials,
  MongoInvalidArgumentError
} from '../../../mongodb';

describe('AuthHandshakeDecorator', function () {
  const mockConnection = sinon.createStubInstance(Connection);
  const metadata = {
    driver: {
      name: 'Node',
      version: '5.0.0'
    },
    os: {
      type: os.type(),
      name: process.platform,
      architecture: process.arch,
      version: os.release()
    },
    platform: 'MacOS'
  };
  const options = {
    id: 1,
    generation: 2,
    hostAddress: new HostAddress('127.0.0.1:27017'),
    monitorCommands: false,
    tls: false,
    loadBalanced: false,
    metadata: metadata
  };

  describe('#decorate', function () {
    context('when no credentials are provided', () => {
      const authContext = {
        connection: mockConnection,
        options: options
      };
      const decorator = new AuthHandshakeDecorator();

      it('does not modify the handshake doc', async function () {
        const handshake = await decorator.decorate({ hello: 1 }, authContext);
        expect(handshake).to.deep.equal({ hello: 1 });
      });
    });

    context('when an invalid mechanism is provided', () => {
      const authContext = {
        credentials: new MongoCredentials({
          username: 'foo',
          password: 'bar',
          mechanism: 'invalid mechanism',
          source: 'invalid mechanism',
          mechanismProperties: {}
        }),
        connection: mockConnection,
        options: options
      };
      const decorator = new AuthHandshakeDecorator();

      it('returns the handshake with default auth', async function () {
        const error = await decorator.decorate({}, authContext).catch(e => e);
        expect(error)
          .to.be.instanceOf(MongoInvalidArgumentError)
          .to.match(/No AuthProvider for/);
      });
    });

    context('when no mechanism provided', function () {
      after(() => sinon.restore());
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const provider = AUTH_PROVIDERS.get(AuthMechanism.MONGODB_SCRAM_SHA256)!;
      const providerSpy = sinon.stub(provider, 'prepare');
      providerSpy.callsFake(async (doc, _) => doc);
      const authContext = {
        credentials: new MongoCredentials({
          username: 'foo',
          password: 'bar',
          source: '$external',
          mechanismProperties: {}
        }),
        connection: mockConnection,
        options: options
      };
      const decorator = new AuthHandshakeDecorator();

      it('returns the handshake with default auth', async function () {
        const handshake = await decorator.decorate({}, authContext);
        expect(providerSpy).to.have.been.called;
        expect(handshake).to.deep.equal({ saslSupportedMechs: '$external.foo' });
      });
    });

    context('when a mechanism is provided', function () {
      const authContext = {
        credentials: new MongoCredentials({
          username: 'foo',
          password: 'bar',
          source: '$external',
          mechanism: AuthMechanism.MONGODB_X509,
          mechanismProperties: {}
        }),
        connection: mockConnection,
        options: options
      };
      const decorator = new AuthHandshakeDecorator();

      it('uses the machanism to prepare the handshake', async function () {
        const handshake = await decorator.decorate({}, authContext);
        expect(handshake).to.deep.equal({
          speculativeAuthenticate: {
            authenticate: 1,
            mechanism: AuthMechanism.MONGODB_X509,
            user: 'foo'
          }
        });
      });
    });
  });
});

import { expect } from 'chai';
import * as os from 'os';
import * as sinon from 'sinon';

import {
  Connection,
  DefaultHandshakeDecorator,
  HostAddress,
  LEGACY_HELLO_COMMAND
} from '../../../mongodb';

describe('DefaultHandshakeDecorator', function () {
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

  describe('#generate', function () {
    context('when the auth context exists', function () {
      context('when compressor options exist', function () {
        const mockConnection = sinon.createStubInstance(Connection);
        const newOptions = { ...options, compressors: ['zstd'] as any };
        const context = { connection: mockConnection, options: newOptions };
        const decorator = new DefaultHandshakeDecorator();

        it('sets the options with the compressors on the handshake', async function () {
          const handshake = await decorator.decorate({}, context);
          expect(handshake).to.deep.equal({
            [LEGACY_HELLO_COMMAND]: 1,
            client: metadata,
            helloOk: true,
            compression: ['zstd']
          });
        });
      });

      context('when compressor options do not exist', function () {
        const mockConnection = sinon.createStubInstance(Connection);
        const context = { connection: mockConnection, options: options };
        const decorator = new DefaultHandshakeDecorator();

        it('sets the options with empty compressors on the handshake', async function () {
          const handshake = await decorator.decorate({}, context);
          expect(handshake).to.deep.equal({
            [LEGACY_HELLO_COMMAND]: 1,
            client: metadata,
            helloOk: true,
            compression: []
          });
        });
      });

      context('when serverApi has a version', function () {
        const mockConnection = sinon.createStubInstance(Connection);
        mockConnection.serverApi = { version: '1' };
        const context = { connection: mockConnection, options: options };
        const decorator = new DefaultHandshakeDecorator();

        it('sets the command name to hello', async function () {
          const handshake = await decorator.decorate({}, context);
          expect(handshake).to.deep.equal({
            hello: 1,
            client: metadata,
            helloOk: true,
            compression: []
          });
        });
      });
    });

    context('when the auth context does not exist', function () {
      const decorator = new DefaultHandshakeDecorator();

      it('returns the handshake with helloOk', async function () {
        const handshake = await decorator.decorate({});
        expect(handshake).to.deep.equal({ [LEGACY_HELLO_COMMAND]: 1, helloOk: true });
      });
    });
  });
});

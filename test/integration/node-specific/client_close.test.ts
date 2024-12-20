const process = require('node:process');
import { expect } from 'chai';
import { type TestConfiguration } from '../../tools/runner/config';
import { runScriptAndGetProcessInfo } from './resource_tracking_script_builder';

describe.skip('client.close() Integration', () => {
  let config: TestConfiguration;

  beforeEach(function () {
    config = this.configuration;
  });

  describe('MongoClient', () => {
    describe('when client is being instantiated and reads a long docker file', () => {
      // our docker env detection uses fs.access which will not be aborted until after it runs
      // fs.access does not support abort signals
      it('the file read is not interrupted by client.close()', async () => {
        await runScriptAndGetProcessInfo(
          'docker-read',
          config,
          async function run({ MongoClient, uri }) {
            /* const dockerPath = '.dockerenv';
            sinon.stub(fs, 'access').callsFake(async () => await sleep(5000));
            await fs.writeFile('.dockerenv', '', { encoding: 'utf8' });
            const client = new MongoClient(uri);
            await client.close();
            unlink(dockerPath); */
          }
        );
      });
    });

    describe('when client is connecting and reads an infinite TLS file', () => {
      it('the file read is interrupted by client.close()', async function () {
        await runScriptAndGetProcessInfo(
          'tls-file-read',
          config,
          async function run({ MongoClient, uri }) {
            const devZeroFilePath = '/dev/zero';
            const client = new MongoClient(uri, { tlsCertificateKeyFile: devZeroFilePath });
            client.connect();
            log({ ActiveResources: process.getActiveResourcesInfo() });
            chai.expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');
            await client.close();
            setTimeout(() =>
              chai.expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise'),
            1000);
          }
        );
      });
    });
  });

  describe('MongoClientAuthProviders', () => {
    describe('when MongoClientAuthProviders is instantiated and token file read hangs', () => {
      it('the file read is interrupted by client.close()', async () => {});
    });
  });

  describe('Topology', () => {
    describe('after a Topology is created through client.connect()', () => {
      it('server selection timers are cleaned up by client.close()', async () => {
        await runScriptAndGetProcessInfo(
          'server-selection-timers',
          config,
          async function run({ MongoClient, uri }) {
            const client = new MongoClient(uri);
            await client.connect();
            await client.close();
          }
        );
      });
    });
  });

  describe('SRVPoller', () => {
    // TODO: only non-LB mode
    describe('after SRVPoller is created', () => {
      it('timers are cleaned up by client.close()', async () => {
        await runScriptAndGetProcessInfo(
          'srv-poller',
          config,
          async function run({ MongoClient, uri }) {
            const client = new MongoClient(uri);
            await client.connect();
            await client.close();
          }
        );
      });
    });
  });

  describe('ClientSession', () => {
    describe('after a clientSession is created and used', () => {
      it('the server-side ServerSession and transaction are cleaned up by client.close()', async function () {
        const client = this.configuration.newClient();
        await client.connect();
        const session = client.startSession();
        session.startTransaction();
        await client.db('db').collection('coll').insertOne({ a: 1 }, { session });

        // assert server-side session exists
        expect(session.serverSession).to.exist;

        await session.endSession();
        await client.close();

        // assert command was sent to server to end server side session
      });
    });
  });

  describe('StateMachine', () => {
    describe('when FLE is enabled and the client has made a KMS request', () => {
      it('no sockets remain after client.close()', async () => {});

      describe('when the TLS file read hangs', () => {
        it('the file read is interrupted by client.close()', async () => {});
      });
    });
  });

  describe('ConnectionPool', () => {
    describe('after new connection pool is created', () => {
      it('minPoolSize timer is cleaned up by client.close()', async () => {});
    });
  });

  describe('MonitorInterval', () => {
    describe('after a new monitor is made', () => {
      it('monitor interval timer is cleaned up by client.close()', async () => {});
    });

    describe('after a heartbeat fails', () => {
      it('the new monitor interval timer is cleaned up by client.close()', async () => {});
    });
  });

  describe('RTTPinger', () => {
    describe('after entering monitor streaming mode ', () => {
      it('the rtt pinger timer is cleaned up by client.close()', async () => {
        // helloReply has a topologyVersion defined
      });
    });
  });

  describe('Connection', () => {
    describe('when connection monitoring is turned on', () => {
      // connection monitoring is by default turned on - with the exception of load-balanced mode
      it('no sockets remain after client.close()', async () => {
        // TODO: skip for LB mode
        await runScriptAndGetProcessInfo(
          'connection-monitoring',
          config,
          async function run({ MongoClient, uri }) {
            const client = new MongoClient(uri);
            await client.connect();
            await client.close();
          }
        );
      });

      it('no server-side connection threads remain after client.close()', async () => {});
    });

    describe('when rtt monitoring is turned on', () => {
      it('no sockets remain after client.close()', async () => {});

      it('no server-side connection threads remain after client.close()', async () => {});
    });

    describe('after a connection is checked out', () => {
      it('no sockets remain after client.close()', async () => {});

      it('no server-side connection threads remain after client.close()', async () => {});
    });

    describe('after a minPoolSize has been set on the ConnectionPool', () => {
      it('no sockets remain after client.close()', async () => {});

      it('no server-side connection threads remain after client.close()', async () => {});
    });
  });

  describe('Cursor', () => {
    describe('after cursors are created', () => {
      it('all active server-side cursors are closed by client.close()', async () => {});
    });
  });
});

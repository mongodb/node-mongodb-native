import { expect } from 'chai';
import * as fs from 'fs';

import { type TestConfiguration } from '../../tools/runner/config';
import { runScriptAndGetProcessInfo } from './resource_tracking_script_builder';
import { sleep } from '../../tools/utils';

describe.skip('MongoClient.close() Integration', () => {
  // note: these tests are set-up in accordance of the resource ownership tree

  let config: TestConfiguration;
  beforeEach(function () {
    config = this.configuration;
  });

  describe('Node.js resource: TLS File read', () => {
    describe('when client is connecting and reads an infinite TLS file', () => {
      it('the file read is interrupted by client.close()', async function () {
        await runScriptAndGetProcessInfo(
          'tls-file-read',
          config,
          async function run({ MongoClient, uri, log, chai }) {
            const devZeroFilePath = '/dev/zero';
            const client = new MongoClient(uri, { tlsCertificateKeyFile: devZeroFilePath });
            client.connect();
            log({ ActiveResources: process.getActiveResourcesInfo() });
            chai.expect(process.getActiveResourcesInfo()).to.include('FSReqPromise');
            await client.close();
            chai.expect(process.getActiveResourcesInfo()).to.not.include('FSReqPromise');
          }
        );
      });
    });
  });

  describe('Node.js resource: .dockerenv file access', () => {
    describe('when client is connecting and reads an infinite .dockerenv file', () => {
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
  });

  describe('MongoClientAuthProviders', () => {
    describe('Node.js resource: Token file read', () => {
      describe('when MongoClientAuthProviders is instantiated and token file read hangs', () => {
        it('the file read is interrupted by client.close()', async () => {});
      });
    });
  });

  describe('Topology', () => {
    describe('Node.js resource: Server Selection Timer', () => {

    });

    describe('Server', () => {
      describe('Monitor', () => {
        describe('MonitorInterval', () => {
          describe('Node.js resource: Timer', () => {

          });
        });

        describe('Connection Monitoring', () => {
          // connection monitoring is by default turned on - with the exception of load-balanced mode
          describe('Node.js resource: Socket', () => {
          it('no sockets remain after client.close()', async () => {
            // TODO: skip for LB mode
            });
          });
          describe('Server resource: connection thread', () => {

          });
        });

        describe('RTT Pinger', () => {
          describe('Node.js resource: Timer', () => {

          });
          describe('Connection', () => {
            describe('Node.js resource: Socket', () => {

            });
            describe('Server resource: connection thread', () => {

            });
          });
        });
      });

      describe('ConnectionPool', () => {
        describe('Node.js resource: minPoolSize timer', () => {

        });

        describe('Node.js resource: checkOut Timer', () => { // waitQueueTimeoutMS

        });

        describe('Connection', () => {
          describe('Node.js resource: Socket', () => {

          });
          describe('Node.js resource: Socket', () => {

          });
        });
      });
    });

    describe('SrvPoller', () => {
      describe('Node.js resource: Timer', () => {

      });
    });
  });

  describe('ClientSession (Implicit)', () => {
    describe('Server resource: LSID/ServerSession', () => {
    });

    describe('Server resource: Transactions', () => {
    });
  });

  describe('ClientSession (Explicit)', () => {
    describe('Server resource: LSID/ServerSession', () => {
    });

    describe('Server resource: Transactions', () => {
    });
  });

  describe('AutoEncrypter', () => {
    describe('KMS Request', () => {
      describe('Node.js resource: TLS file read', () => {

      });
      describe('Node.js resource: Socket', () => {

      });
    });
  });

  describe('ClientEncryption', () => {
    describe('KMS Request', () => {
      describe('Node.js resource: TLS file read', () => {

      });
      describe('Node.js resource: Socket', () => {

      });
    });
  });

  describe('Server resource: Cursor', () => {
    describe('after cursors are created', () => {
      it('all active server-side cursors are closed by client.close()', async () => {});
    });
  });
});

describe.skip('OLD', () => {
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
});

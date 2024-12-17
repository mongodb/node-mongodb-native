import { TestConfiguration } from '../../tools/runner/config';
import { runScriptAndReturnResourceInfo } from './resource_tracking_script_builder';

describe.only('client.close() Integration', () => {
  let config: TestConfiguration;
  beforeEach(function () {
    config = this.configuration;
  });

  describe('MongoClient', () => {
    describe('when client is being instantiated and reads a long docker file', () => {
        // our docker env detection uses fs.access which will not be aborted until after it runs
        // fs.access does not support abort signals
        it('the file read is not interrupted by client.close', () => {
        });
    });
    describe('when client is connecting and reads a TLS long file', () => {
        it('the file read is interrupted by client.close', () => {
        });
    });
  });

  describe('MongoClientAuthProviders', () => {
    describe('when MongoClientAuthProviders is instantiated', () => {
        it('the token cache is cleaned up by client.close', () => {
        });
    });
  });

  describe('Topology', () => {
    describe('after a Topology is explicitly created', () => {
        it('timers are cleaned up by client.close()', () => {

        });
    });
    describe('after a Topology is created through client.connect()', () => {
        it('timers are cleaned up by client.close()', () => {

        });
    });
  });

  describe('SRVPoller', () => {
    describe('after SRVPoller is explicitly created', () => {
        it('timers are cleaned up by client.close()', () => {

        });
    });

    // SRVPoller is implicitly created after an SRV string's topology transitions to sharded
    describe('after SRVPoller is implicitly created', () => {
        it('timers are cleaned up by client.close()', () => {

        });
    });
  });

  describe('ClientSession', () => {
    describe('after a clientSession is created', () => {
        it('the server-side ServerSession and transaction are cleaned up by client.close()', () => {

        });
    });
  });

  describe('StateMachine', () => {
    describe('when FLE is enabled and the client has made a KMS request', () => {
        it('no sockets remain after client.close', () => {

        });
        it('no server-side connection threads remain after client.close', () => {

        });
        describe('when the TLS file read hangs', () => {
            it('the file read is interrupted by client.close', () => {

            });
        });
    });
  });

  describe('ConnectionPool', () => {
    describe('after new connection pool is created', () => {
        it('minPoolSize timer is cleaned up by client.close()', () => {

        });
    });
  });

  describe('MonitorInterval', () => {
    describe('after a new monitor is made', () => {
        it('monitor interval timer is cleaned up by client.close()', () => {

        });
    });

    describe('after a heartbeat fails', () => {
        it('monitor interval timer is cleaned up by client.close()', () => {

        });
    });
  });

  describe('RTTPinger', () => {
    describe('after helloReply has a topologyVersion defined fails', () => {
        it('rtt pinger timer is cleaned up by client.close()', () => {

        });
    });
  });

  describe('Connection', () => {
    describe('when connection monitoring is turned on', () => {
        it('no sockets remain after client.close', () => {

        });
        it('no server-side connection threads remain after client.close', () => {

        });
    });

    describe('when rtt monitoring is turned on', () => {
        it('no sockets remain after client.close', () => {

        });
        it('no server-side connection threads remain after client.close', () => {

        });
    });

    describe('after a connection is checked out', () => {
        it('no sockets remain after client.close', () => {

        });
        it('no server-side connection threads remain after client.close', () => {

        });
    });

    describe('after a minPoolSize has been set on the ConnectionPool', () => {
        it('no sockets remain after client.close', () => {

        });
        it('no server-side connection threads remain after client.close', () => {

        });
    });
  });

  describe('Cursor', () => {
    describe('after cursors are created', () => {
        it('all active server-side cursors are closed by client.close()', () => {

        });
    });
  });
});

import {
  MongoClient,
} from '../../mongodb';

/*
async function runWithProcessAndCheck(_fn) {
  start process
  Run fn in process
  Assert no resources
  Close process
} 
*/

describe.only('client.close() Resource Management Integration tests', () => {
  let client: MongoClient;
  beforeEach(function () {
    client = this.configuration.newClient();
  });

  describe('File System', () => {
    context('when client is closed', () => {
        context('after client is connected', () => {
            it('the TLS file access is cleaned up', () => {

            });
        });
        context('after client is created ', () => {
            // our docker env detection uses fs.access which will not be aborted until after it runs
            // fs.access does not support abort signals
            it('the .docker file access is cleaned up', () => {

            });
        });

        context('when FLE is enabled', () => {
            context('after client has made a KMS request', () => {
                it('the TLS file access is cleaned up', () => {

                });
            });
        });
    });
  });

  describe('Connection Creation and Socket Lifetime', () => {
    context('when client is closed', () => {
        context('after client is connected', () => {
            it('the socket is cleaned up', () => {

            });
        });

        context('after a connection is checked out', () => {
            it('the socket is cleaned up', () => {

            });
        });

        context('after a minPoolSize has been set on the ConnectionPool', () => {
            it('the socket is cleaned up', () => {

            });
        });

        context('when connection monitoring is turned on', () => {
            it('the socket is cleaned up', () => {

            });
        });

        context('when rtt monitoring is turned on', () => {
            it('the socket is cleaned up', () => {

            });
        });

        context('when FLE is enabled', () => {
            context('after client has made a KMS request', () => {
                it('the socket is cleaned up', () => {

                });
            });
        });
    });
  });

  describe('Timers', () => {
    context('when client is closed', () => {
        context('after SRVPoller is explicitly created', () => {
            it('timers are cleaned up', () => {

            });
        });

        // SRVPoller is implicitly created after an SRV string's topology transitions to sharded
        context('after SRVPoller is implicitly created', () => {
            it('timers are cleaned up', () => {

            });
        });

        context('after new connection pool is created', () => {
            it('minPoolSize timer is cleaned up', () => {

            });
        });

        context('after a new monitor is made', () => {
            it('monitor interval timer is cleaned up', () => {

            });
        });

        context('after a heartbeat fails', () => {
            it('monitor interval timer is cleaned up', () => {

            });
        });

        context('after helloReply has a topologyVersion defined fails', () => {
            it('rtt pinger timer is cleaned up', () => {

            });
        });
    });
  });

  describe('Cursor Clean-up', () => {
    context('when client is closed', () => {
        context('after cursors are created', () => {
            it('closes all active cursors', () => {

            });
        });
    });
  });
});

import { fork } from 'child_process';
import {
  MongoClient,
} from '../../mongodb';
import { on, once } from 'node:events';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { TestConfiguration } from '../../tools/runner/config';
import { expect } from 'chai';
import { StringOrPlaceholder } from '../../tools/unified-spec-runner/schema';

/*
export async function testScriptFactory(
  name: string,
  uri: string,
  iterations: number,
  func: Function
) {
  let resourceScript = await readFile(RESOURCE_SCRIPT_PATH, { encoding: 'utf8' });

  resourceScript = resourceScript.replace('DRIVER_SOURCE_PATH', DRIVER_SRC_PATH);
  resourceScript = resourceScript.replace('FUNCTION_STRING', `(${func.toString()})`);
  resourceScript = resourceScript.replace('NAME_STRING', JSON.stringify(name));
  resourceScript = resourceScript.replace('URI_STRING', JSON.stringify(uri));
  resourceScript = resourceScript.replace('ITERATIONS_STRING', `${iterations}`);

  return resourceScript;
}

export async function runScriptAndReturnResourceInfo(
  name: string,
  config: TestConfiguration,
  func: Function
) {

  const pathName = `scripts/${name}.cjs`;
  const scriptContent = await testScriptFactory(name, config.url(), func);
  await writeFile(name, func.toString(), { encoding: 'utf8' });

  const processDiedController = new AbortController();
  const script = fork(name, { execArgv: ['--expose-gc'] });

  // Interrupt our awaiting of messages if the process crashed
  script.once('close', exitCode => {
    if (exitCode !== 0) {
      processDiedController.abort(new Error(`process exited with: ${exitCode}`));
    }
  });

  const willClose = once(script, 'close');

  // make sure the process ended
  const [exitCode] = await willClose;
  expect(exitCode, 'process should have exited with zero').to.equal(0);

  return process.report.getReport().libuv;
}
*/

describe.only('client.close() Integration', () => {
  let client: MongoClient;
  let config: TestConfiguration;
  beforeEach(function () {
    config = this.configuration;
    client = this.configuration.newClient();
  });

  describe('File System', () => {
    describe('when client is connected and reading a TLS long file', () => {
        it('the file read is interrupted by client.close', () => {

        });
    });
    describe('when client is created and reading a long docker file', () => {
        // our docker env detection uses fs.access which will not be aborted until after it runs
        // fs.access does not support abort signals
        it('the file read is not interrupted by client.close', () => {
        });
    });

    describe('when FLE is enabled and the client has made a KMS request that is reading a long TLS file', () => {
        it('the file read is interrupted by client.close', () => {

        });
    });
  });

  describe('Connection Creation and Socket Lifetime', () => {
    describe('after client is connected', () => {
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

    describe('when FLE is enabled and the client has made a KMS request', () => {
        it('no sockets remain after client.close', () => {

        });
        it('no server-side connection threads remain after client.close', () => {

        });
    });
  });

  describe('Timers', () => {
    describe('after SRVPoller is explicitly created', () => {
        it('timers are cleaned up by client.close()', () => {

        });
    });

    // SRVPoller is implicitly created after an SRV string's topology transitions to sharded
    describe('after SRVPoller is implicitly created', () => {
        it('timers are cleaned up by client.close()', () => {

        });
    });

    describe('after new connection pool is created', () => {
        it('minPoolSize timer is cleaned up by client.close()', () => {

        });
    });

    describe('after a new monitor is made', () => {
        it('monitor interval timer is cleaned up by client.close()', () => {

        });
    });

    describe('after a heartbeat fails', () => {
        it('monitor interval timer is cleaned up by client.close()', () => {

        });
    });

    describe('after helloReply has a topologyVersion defined fails', () => {
        it('rtt pinger timer is cleaned up by client.close()', () => {

        });
    });
  });

  describe('Cursor Clean-up', () => {
    describe('after cursors are created', () => {
        it('all active server-side cursors are closed by client.close()', () => {

        });
    });
  });

  describe('Sessions', () => {
    describe('after a clientSession is created', () => {
        it('the server-side ServerSession is cleaned up by client.close()', () => {

        });
    });
  });
});

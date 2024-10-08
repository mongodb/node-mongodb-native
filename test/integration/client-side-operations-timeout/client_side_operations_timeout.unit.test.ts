/**
 * The following tests are described in CSOTs spec prose tests as "unit" tests
 * The tests enumerated in this section could not be expressed in either spec or prose format.
 * Drivers SHOULD implement these if it is possible to do so using the driver's existing test infrastructure.
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';
import { TLSSocket } from 'tls';
import { promisify } from 'util';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { StateMachine } from '../../../src/client-side-encryption/state_machine';
import {
  Connection,
  ConnectionPool,
  CSOTTimeoutContext,
  type MongoClient,
  MongoOperationTimeoutError,
  Timeout,
  TimeoutContext,
  Topology
} from '../../mongodb';
import { sleep } from '../../tools/utils';
import { createTimerSandbox } from '../../unit/timer_sandbox';

// TODO(NODE-5824): Implement CSOT prose tests
describe('CSOT spec unit tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    sinon.restore();
    await client?.close();
  });

  context('Server Selection and Connection Checkout', function () {
    it('Operations should ignore waitQueueTimeoutMS if timeoutMS is also set.', async function () {
      client = this.configuration.newClient({ waitQueueTimeoutMS: 999999, timeoutMS: 10000 });
      sinon.spy(Timeout, 'expires');
      const timeoutContextSpy = sinon.spy(TimeoutContext, 'create');

      await client.db('db').collection('collection').insertOne({ x: 1 });

      const createCalls = timeoutContextSpy.getCalls().filter(
        // @ts-expect-error accessing concrete field
        call => call.args[0].timeoutMS === 10000
      );

      expect(createCalls).to.have.length.greaterThanOrEqual(1);
      expect(Timeout.expires).to.not.have.been.calledWith(999999);
    });

    it('If timeoutMS is set for an operation, the remaining timeoutMS value should apply to connection checkout after a server has been selected.', async function () {
      client = this.configuration.newClient({ timeoutMS: 1000 });
      // Spy on connection checkout and pull options argument
      const checkoutSpy = sinon.spy(ConnectionPool.prototype, 'checkOut');
      const expiresSpy = sinon.spy(Timeout, 'expires');

      await client.db('db').collection('collection').insertOne({ x: 1 });

      expect(checkoutSpy).to.have.been.calledOnce;
      const timeoutContext = checkoutSpy.lastCall.args[0].timeoutContext;
      expect(timeoutContext).to.exist;
      // Check that we passed through the timeout
      //  @ts-expect-error accessing private properties
      expect(timeoutContext._serverSelectionTimeout).to.be.instanceOf(Timeout);
      //  @ts-expect-error accessing private properties
      expect(timeoutContext._serverSelectionTimeout).to.equal(
        //  @ts-expect-error accessing private properties
        timeoutContext._connectionCheckoutTimeout
      );

      // Check that no more Timeouts are constructed after we enter checkout
      expect(!expiresSpy.calledAfter(checkoutSpy));
    });

    it('If timeoutMS is not set for an operation, waitQueueTimeoutMS should apply to connection checkout after a server has been selected.', async function () {
      client = this.configuration.newClient({ waitQueueTimeoutMS: 123456 });

      const checkoutSpy = sinon.spy(ConnectionPool.prototype, 'checkOut');
      const selectServerSpy = sinon.spy(Topology.prototype, 'selectServer');
      const expiresSpy = sinon.spy(Timeout, 'expires');

      await client.db('db').collection('collection').insertOne({ x: 1 });
      expect(checkoutSpy).to.have.been.calledAfter(selectServerSpy);

      expect(expiresSpy).to.have.been.calledWith(123456);
    });

    /* eslint-disable @typescript-eslint/no-empty-function */
    context.skip(
      'If a new connection is required to execute an operation, min(remaining computedServerSelectionTimeout, connectTimeoutMS) should apply to socket establishment.',
      () => {}
    ).skipReason =
      'TODO(DRIVERS-2347): Requires this ticket to be implemented before we can assert on connection CSOT behaviour';

    context(
      'For drivers that have control over OCSP behavior, min(remaining computedServerSelectionTimeout, 5 seconds) should apply to HTTP requests against OCSP responders.',
      () => {}
    );
  });

  context.skip('Socket timeouts', function () {
    context(
      'If timeoutMS is unset, operations fail after two non-consecutive socket timeouts.',
      () => {}
    );
  }).skipReason =
    'TODO(NODE-5682): Add CSOT support for socket read/write at the connection layer for CRUD APIs';

  describe('Client side encryption', function () {
    describe('KMS requests', function () {
      const stateMachine = new StateMachine({} as any);
      const request = {
        addResponse: _response => {},
        status: {
          type: 1,
          code: 1,
          message: 'notARealStatus'
        },
        bytesNeeded: 500,
        kmsProvider: 'notRealAgain',
        endpoint: 'fake',
        message: Buffer.from('foobar')
      };

      context('when StateMachine.kmsRequest() is passed a `CSOTimeoutContext`', function () {
        beforeEach(async function () {
          sinon.stub(TLSSocket.prototype, 'connect').callsFake(function (..._args) {});
        });

        afterEach(async function () {
          sinon.restore();
        });

        it('the kms request times out through remainingTimeMS', async function () {
          const timeoutContext = new CSOTTimeoutContext({
            timeoutMS: 500,
            serverSelectionTimeoutMS: 30000
          });
          const err = await stateMachine.kmsRequest(request, timeoutContext).catch(e => e);
          expect(err).to.be.instanceOf(MongoOperationTimeoutError);
          expect(err.errmsg).to.equal('KMS request timed out');
        });
      });

      context('when StateMachine.kmsRequest() is not passed a `CSOTimeoutContext`', function () {
        let clock: sinon.SinonFakeTimers;
        let timerSandbox: sinon.SinonSandbox;

        let sleep;

        beforeEach(async function () {
          sinon.stub(TLSSocket.prototype, 'connect').callsFake(function (..._args) {
            clock.tick(30000);
          });
          timerSandbox = createTimerSandbox();
          clock = sinon.useFakeTimers();
          sleep = promisify(setTimeout);
        });

        afterEach(async function () {
          if (clock) {
            timerSandbox.restore();
            clock.restore();
            clock = undefined;
          }
          sinon.restore();
        });

        it('the kms request does not timeout within 30 seconds', async function () {
          const sleepingFn = async () => {
            await sleep(30000);
            throw Error('Slept for 30s');
          };

          const err$ = Promise.all([stateMachine.kmsRequest(request), sleepingFn()]).catch(e => e);
          clock.tick(30000);
          const err = await err$;
          expect(err.message).to.equal('Slept for 30s');
        });
      });
    });

    describe('Auto Encryption', function () {
      context('when provided timeoutMS and command hangs', function () {
        let encryptedClient;

        beforeEach(async function () {
          encryptedClient = this.configuration.newClient(
            {},
            {
              autoEncryption: {
                extraOptions: {
                  mongocryptdBypassSpawn: true,
                  mongocryptdURI: 'mongodb://localhost:27017/db?serverSelectionTimeoutMS=1000',
                  mongocryptdSpawnArgs: [
                    '--pidfilepath=bypass-spawning-mongocryptd.pid',
                    '--port=27017'
                  ]
                },
                keyVaultNamespace: 'admin.datakeys',
                kmsProviders: {
                  aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                  local: { key: Buffer.alloc(96) }
                }
              },
              timeoutMS: 500
            }
          );
          await encryptedClient.connect();

          const stub = sinon
            // @ts-expect-error accessing private method
            .stub(Connection.prototype, 'sendCommand')
            .callsFake(async function* (...args) {
              await sleep(1000);
              yield* stub.wrappedMethod.call(this, ...args);
            });
        });

        afterEach(async function () {
          await encryptedClient?.close();
          sinon.restore();
        });

        it('the command should fail due to a timeout error', async function () {
          const err = await encryptedClient
            .db()
            .command({ ping: 1 })
            .catch(e => e);
          expect(err).to.be.instanceOf(MongoOperationTimeoutError);
        });
      });

      context('when not provided timeoutMS and command hangs', function () {
        let encryptedClient;
        let clock: sinon.SinonFakeTimers;
        let timerSandbox: sinon.SinonSandbox;
        let sleep;

        beforeEach(async function () {
          encryptedClient = this.configuration.newClient(
            {},
            {
              autoEncryption: {
                keyVaultNamespace: 'admin.datakeys',
                kmsProviders: {
                  aws: { accessKeyId: 'example', secretAccessKey: 'example' },
                  local: { key: Buffer.alloc(96) }
                }
              }
            }
          );
          await encryptedClient.connect();
          timerSandbox = createTimerSandbox();
          clock = sinon.useFakeTimers();
          sleep = promisify(setTimeout);
          const stub = sinon
            // @ts-expect-error accessing private method
            .stub(Connection.prototype, 'sendCommand')
            .callsFake(async function* (...args) {
              await sleep(1000);
              yield* stub.wrappedMethod.call(this, ...args);
            });
        });

        afterEach(async function () {
          if (clock) {
            timerSandbox.restore();
            clock.restore();
            clock = undefined;
          }
          await encryptedClient?.close();
        });

        it('the command should not fail due to a timeout error within 30 seconds', async function () {
          const sleepingFn = async () => {
            await sleep(30000);
            throw Error('Slept for 30s');
          };

          const err$ = Promise.all([encryptedClient.db().command({ ping: 1 }), sleepingFn()]).catch(
            e => e
          );
          clock.tick(30000);
          const err = await err$;
          expect(err.message).to.equal('Slept for 30s');
        });
      });
    });
  });

  context.skip('Background Connection Pooling', function () {
    context(
      'When doing minPoolSize maintenance, connectTimeoutMS is used as the timeout for socket establishment.',
      () => {}
    );
  }).skipReason = 'TODO(NODE-6091): Implement CSOT logic for Background Connection Pooling';
  /* eslint-enable @typescript-eslint/no-empty-function */
});

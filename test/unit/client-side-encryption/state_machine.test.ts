import { BSON, Int32, Long, serialize } from 'bson';
import { expect } from 'chai';
import { EventEmitter, once } from 'events';
import * as fs from 'fs/promises';
import { type MongoCryptKMSRequest } from 'mongodb-client-encryption';
import * as net from 'net';
import * as sinon from 'sinon';
import { setTimeout as setTimeoutAsync } from 'timers/promises';
import * as tls from 'tls';

import {
  Collection,
  CSOTTimeoutContext,
  CursorTimeoutContext,
  Db,
  type FindOptions,
  MongoClient,
  runNodelessTests,
  squashError,
  StateMachine
} from '../../mongodb';
import { sleep } from '../../tools/utils';

describe('StateMachine', function () {
  class MockRequest implements MongoCryptKMSRequest {
    _bytesNeeded: number;
    endpoint = 'some.fake.host.com';
    _kmsProvider = 'aws';

    constructor(
      public _message: Buffer,
      bytesNeeded
    ) {
      this._bytesNeeded = typeof bytesNeeded === 'number' ? bytesNeeded : 1024;
    }

    get message() {
      return this._message;
    }

    get bytesNeeded() {
      return this._bytesNeeded;
    }

    get kmsProvider() {
      return this._kmsProvider;
    }

    get status() {
      return { type: 1, code: 2, message: 'something went wrong' };
    }

    addResponse(buffer) {
      this._bytesNeeded -= buffer.length;
    }
  }

  describe('#markCommand', function () {
    let runCommandStub;
    let dbStub;
    let clientStub;

    beforeEach(function () {
      if (runNodelessTests) {
        // sinon doesn't work in nodeless tests
        this.skip();
      }
      this.sinon = sinon.createSandbox();
      runCommandStub = this.sinon.stub().resolves({});
      dbStub = this.sinon.createStubInstance(Db, {
        command: runCommandStub
      });
      clientStub = this.sinon.createStubInstance(MongoClient, {
        db: dbStub
      });
    });

    const command = {
      encryptedFields: {},
      a: new Long('0'),
      b: new Int32(0)
    };
    const options = {
      promoteLongs: false,
      promoteValues: false,
      signal: undefined,
      timeoutMS: undefined
    };
    const serializedCommand = serialize(command);
    const stateMachine = new StateMachine({} as any);

    context('when executing the command', function () {
      it('does not promote values', function () {
        stateMachine.markCommand(clientStub, 'test.coll', serializedCommand);
        expect(runCommandStub.calledWith(command, options)).to.be.true;
      });
    });
  });

  describe('kmsRequest', function () {
    let sandbox: sinon.SinonSandbox;
    class MockSocket extends EventEmitter {
      constructor(callback) {
        super();
        this.on('connect', callback);
      }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      write() {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      destroy() {}
      end(callback) {
        Promise.resolve().then(callback);
      }
    }

    before(function () {
      sandbox = sinon.createSandbox();
    });

    afterEach(function () {
      sandbox.restore();
    });

    context('when handling standard kms requests', function () {
      beforeEach(function () {
        this.fakeSocket = undefined;
        sandbox.stub(tls, 'connect').callsFake((options, callback) => {
          this.fakeSocket = new MockSocket(callback);
          return this.fakeSocket;
        });
      });

      it('should only resolve once bytesNeeded drops to zero', async function () {
        const stateMachine = new StateMachine({} as any);
        const request = new MockRequest(Buffer.from('foobar'), 500);
        let status = 'pending';
        stateMachine
          .kmsRequest(request)
          .then(
            () => (status = 'resolved'),
            () => (status = 'rejected')
          )
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          .catch(() => {});

        this.fakeSocket.emit('connect');
        await sleep();

        expect(status).to.equal('pending');
        expect(request.bytesNeeded).to.equal(500);
        expect(request.kmsProvider).to.equal('aws');
        this.fakeSocket.emit('data', Buffer.alloc(300));
        await sleep();

        expect(status).to.equal('pending');
        expect(request.bytesNeeded).to.equal(200);
        this.fakeSocket.emit('data', Buffer.alloc(200));
        await sleep();

        expect(status).to.equal('resolved');
        expect(request.bytesNeeded).to.equal(0);
      });

      it('resolves once the KMS response arrives when CSOT is enabled', async function () {
        const stateMachine = new StateMachine({} as any);
        const request = new MockRequest(Buffer.from('foobar'), -1);
        const timeoutContext = new CSOTTimeoutContext({
          timeoutMS: 1000,
          serverSelectionTimeoutMS: 30000
        });
        let status = 'pending';
        stateMachine
          .kmsRequest(request, { timeoutContext })
          .then(
            () => (status = 'resolved'),
            () => (status = 'rejected')
          )
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          .catch(() => {});

        this.fakeSocket.emit('connect');
        this.fakeSocket.emit('data', Buffer.alloc(0));
        await sleep();

        // With CSOT enabled the request resolves as soon as the KMS response arrives, well within
        // the configured timeout.
        expect(status).to.equal('resolved');
      });
    });

    context('when socket options are provided', function () {
      const stateMachine = new StateMachine({
        socketOptions: { autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 300 }
      } as any);
      const request = new MockRequest(Buffer.from('foobar'), -1);
      let connectOptions;

      it('passes them through to the socket', async function () {
        sandbox.stub(tls, 'connect').callsFake((options, callback) => {
          connectOptions = options;
          this.fakeSocket = new MockSocket(callback);
          return this.fakeSocket;
        });
        const kmsRequestPromise = stateMachine.kmsRequest(request);

        await setTimeoutAsync(0);
        this.fakeSocket.emit('data', Buffer.alloc(0));

        await kmsRequestPromise;
        expect(connectOptions.autoSelectFamily).to.equal(true);
        expect(connectOptions.autoSelectFamilyAttemptTimeout).to.equal(300);
      });
    });

    context('when a kmsConnectCallback is provided', function () {
      it('invokes the callback with host/port and uses the returned socket', async function () {
        let received;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const providedSocket = new MockSocket(() => {});
        // The test harness's EE checker requires an error listener added synchronously;
        // production code only attaches one to the tls-wrapped socket, not the raw
        // callback-provided socket, so the test adds a no-op listener here.
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        providedSocket.on('error', () => {});
        const stateMachine = new StateMachine({
          kmsConnectCallback: async opts => {
            received = opts;
            return providedSocket as any;
          }
        } as any);
        const request = new MockRequest(Buffer.from('foobar'), -1);
        let connectOptions;
        sandbox.stub(tls, 'connect').callsFake((options, callback) => {
          connectOptions = options;
          this.fakeSocket = new MockSocket(callback);
          return this.fakeSocket;
        });

        const kmsRequestPromise = stateMachine.kmsRequest(request);
        await setTimeoutAsync(0);
        this.fakeSocket.emit('data', Buffer.alloc(0));
        await kmsRequestPromise;

        expect(received).to.include({
          host: 'some.fake.host.com',
          port: 443,
          timeoutMS: undefined
        });
        expect(received.signal).to.be.instanceOf(AbortSignal);
        expect(connectOptions.socket).to.equal(providedSocket);
      });

      it('propagates a callback error wrapped in MongoCryptError with the original cause', async function () {
        const stateMachine = new StateMachine({
          kmsConnectCallback: async () => {
            throw new Error('Test Error');
          }
        } as any);
        const request = new MockRequest(Buffer.from('foobar'), 500);

        const err = await stateMachine.kmsRequest(request).catch(e => e);
        expect(err).to.have.property('name', 'MongoCryptError');
        expect(err.cause).to.have.property('message', 'Test Error');
      });

      it('passes remaining timeoutMS to the callback when CSOT is enabled', async function () {
        let received;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const providedSocket = new MockSocket(() => {});
        // The test harness's EE checker requires an error listener added synchronously;
        // production code only attaches one to the tls-wrapped socket, not the raw
        // callback-provided socket, so the test adds a no-op listener here.
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        providedSocket.on('error', () => {});
        const stateMachine = new StateMachine({
          kmsConnectCallback: async opts => {
            received = opts;
            return providedSocket as any;
          }
        } as any);
        const request = new MockRequest(Buffer.from('foobar'), -1);
        sandbox.stub(tls, 'connect').callsFake((options, callback) => {
          this.fakeSocket = new MockSocket(callback);
          return this.fakeSocket;
        });
        const timeoutContext = new CSOTTimeoutContext({
          timeoutMS: 1000,
          serverSelectionTimeoutMS: 30000
        });

        const kmsRequestPromise = stateMachine.kmsRequest(request, { timeoutContext });
        await setTimeoutAsync(0);
        this.fakeSocket.emit('data', Buffer.alloc(0));
        await kmsRequestPromise;

        expect(received.timeoutMS).to.be.a('number');
        expect(received.timeoutMS).to.be.greaterThan(0);
      });

      it('rejects with MongoOperationTimeoutError without invoking the callback when the CSOT budget is already exhausted', async function () {
        let called = false;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const providedSocket = new MockSocket(() => {});
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        providedSocket.on('error', () => {});
        const stateMachine = new StateMachine({
          kmsConnectCallback: async () => {
            called = true;
            return providedSocket as any;
          }
        } as any);
        const request = new MockRequest(Buffer.from('foobar'), -1);
        const timeoutContext = new CSOTTimeoutContext({
          timeoutMS: 50,
          serverSelectionTimeoutMS: 30000
        });
        await sleep(60);

        const err = await stateMachine.kmsRequest(request, { timeoutContext }).catch(e => e);

        expect(err).to.have.property('name', 'MongoOperationTimeoutError');
        expect(called).to.equal(false);
      });

      it('does not apply a timeout backstop or pass a timeoutMS to the callback when the CSOT budget is infinite (timeoutMS: 0)', async function () {
        let received;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const providedSocket = new MockSocket(() => {});
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        providedSocket.on('error', () => {});
        const stateMachine = new StateMachine({
          kmsConnectCallback: async opts => {
            received = opts;
            return providedSocket as any;
          }
        } as any);
        const request = new MockRequest(Buffer.from('foobar'), -1);
        sandbox.stub(tls, 'connect').callsFake((options, callback) => {
          this.fakeSocket = new MockSocket(callback);
          return this.fakeSocket;
        });
        const timeoutContext = new CSOTTimeoutContext({
          timeoutMS: 0,
          serverSelectionTimeoutMS: 30000
        });

        const kmsRequestPromise = stateMachine.kmsRequest(request, { timeoutContext });
        await setTimeoutAsync(0);
        this.fakeSocket.emit('data', Buffer.alloc(0));

        await kmsRequestPromise;

        expect(received.timeoutMS).to.equal(undefined);
      });

      it('aborts the callback signal and rejects with MongoOperationTimeoutError when the backstop timeout wins', async function () {
        let capturedSignal: AbortSignal | undefined;
        const neverResolvingCallback = ({ signal }) => {
          capturedSignal = signal;
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          return new Promise(() => {});
        };
        const stateMachine = new StateMachine({
          kmsConnectCallback: neverResolvingCallback
        } as any);
        const request = new MockRequest(Buffer.from('foobar'), -1);
        const timeoutContext = new CSOTTimeoutContext({
          timeoutMS: 20,
          serverSelectionTimeoutMS: 30000
        });

        const kmsRequestPromise = stateMachine
          .kmsRequest(request, { timeoutContext })
          .catch(e => e);
        await sleep(60);

        const err = await kmsRequestPromise;
        expect(err).to.have.property('name', 'MongoOperationTimeoutError');
        expect(capturedSignal?.aborted).to.equal(true);
      });
    });

    context('when tls options are provided', function () {
      context('when the options are insecure', function () {
        ['tlsInsecure', 'tlsAllowInvalidCertificates', 'tlsAllowInvalidHostnames'].forEach(
          function (option) {
            context(`when the option is ${option}`, function () {
              const stateMachine = new StateMachine({
                tlsOptions: { aws: { [option]: true } }
              } as any);
              const request = new MockRequest(Buffer.from('foobar'), 500);

              it('rejects with the validation error', async function () {
                const err = await stateMachine.kmsRequest(request).catch(e => e);
                expect(err.message).to.equal(`Insecure TLS options prohibited for aws: ${option}`);
              });
            });
          }
        );
      });

      context('when the options are secure', function () {
        context('when providing tlsCertificateKeyFile', function () {
          const stateMachine = new StateMachine({
            tlsOptions: { aws: { tlsCertificateKeyFile: 'test.pem' } }
          } as any);
          const request = new MockRequest(Buffer.from('foobar'), -1);
          const buffer = Buffer.from('foobar');
          let connectOptions;

          it('sets the cert and key options in the tls connect options', async function () {
            sandbox.stub(fs, 'readFile').callsFake(fileName => {
              expect(fileName).to.equal('test.pem');
              return Promise.resolve(buffer);
            });
            sandbox.stub(tls, 'connect').callsFake((options, callback) => {
              connectOptions = options;
              this.fakeSocket = new MockSocket(callback);
              return this.fakeSocket;
            });
            const kmsRequestPromise = stateMachine.kmsRequest(request);

            await setTimeoutAsync(0);
            this.fakeSocket.emit('data', Buffer.alloc(0));

            await kmsRequestPromise;
            expect(connectOptions.cert).to.equal(buffer);
            expect(connectOptions.key).to.equal(buffer);
          });
        });

        context('when providing tlsCAFile', function () {
          const stateMachine = new StateMachine({
            tlsOptions: { aws: { tlsCAFile: 'test.pem' } }
          } as any);
          const request = new MockRequest(Buffer.from('foobar'), -1);
          const buffer = Buffer.from('foobar');
          let connectOptions;

          it('sets the ca options in the tls connect options', async function () {
            sandbox.stub(fs, 'readFile').callsFake(fileName => {
              expect(fileName).to.equal('test.pem');
              return Promise.resolve(buffer);
            });
            sandbox.stub(tls, 'connect').callsFake((options, callback) => {
              connectOptions = options;
              this.fakeSocket = new MockSocket(callback);
              return this.fakeSocket;
            });
            const kmsRequestPromise = stateMachine.kmsRequest(request);

            await setTimeoutAsync(0);
            this.fakeSocket.emit('data', Buffer.alloc(0));

            await kmsRequestPromise;
            expect(connectOptions.ca).to.equal(buffer);
          });
        });

        context('when providing tlsCertificateKeyFilePassword', function () {
          const stateMachine = new StateMachine({
            tlsOptions: { aws: { tlsCertificateKeyFilePassword: 'test' } }
          } as any);
          const request = new MockRequest(Buffer.from('foobar'), -1);
          let connectOptions;

          it('sets the passphrase option in the tls connect options', async function () {
            sandbox.stub(tls, 'connect').callsFake((options, callback) => {
              connectOptions = options;
              this.fakeSocket = new MockSocket(callback);
              return this.fakeSocket;
            });
            const kmsRequestPromise = stateMachine.kmsRequest(request);

            await setTimeoutAsync(0);
            this.fakeSocket.emit('data', Buffer.alloc(0));

            await kmsRequestPromise;
            expect(connectOptions.passphrase).to.equal('test');
          });
        });
      });
    });

    context('when server closed the socket', function () {
      context('Socks5', function () {
        let server;

        beforeEach(async function () {
          server = net.createServer(async socket => {
            socket.end();
          });
          server.listen(0);
          await once(server, 'listening');
        });

        afterEach(function () {
          server.close();
        });

        it('throws a MongoCryptError with SocksClientError cause', async function () {
          const stateMachine = new StateMachine({
            proxyOptions: {
              proxyHost: 'localhost',
              proxyPort: server.address().port
            }
          } as any);
          const request = new MockRequest(Buffer.from('foobar'), 500);

          try {
            await stateMachine.kmsRequest(request);
          } catch (err) {
            expect(err.name).to.equal('MongoCryptError');
            expect(err.message).to.equal('KMS request failed');
            expect(err.cause.constructor.name).to.equal('SocksClientError');
            return;
          }
          expect.fail('missed exception');
        });
      });

      context('endpoint with host and port', function () {
        let server;
        let serverSocket;

        beforeEach(async function () {
          server = net.createServer(async socket => {
            serverSocket = socket;
          });
          server.listen(0);
          await once(server, 'listening');
        });

        afterEach(function () {
          server.close();
        });

        beforeEach(async function () {
          const netSocket = net.connect({
            port: server.address().port
          });
          await once(netSocket, 'connect');
          sandbox.stub(tls, 'connect').returns(netSocket);
        });

        afterEach(function () {
          server.close();
          sandbox.restore();
        });

        it('throws a MongoCryptError error', async function () {
          const stateMachine = new StateMachine({
            host: 'localhost',
            port: server.address().port
          } as any);
          const request = new MockRequest(Buffer.from('foobar'), 500);

          try {
            const kmsRequestPromise = stateMachine.kmsRequest(request);

            await setTimeoutAsync(0);
            serverSocket.end();

            await kmsRequestPromise;
          } catch (err) {
            expect(err.name).to.equal('MongoCryptError');
            expect(err.message).to.equal('KMS request closed');
            return;
          }
          expect.fail('missed exception');
        });
      });
    });
  });

  describe('Socks5 support', function () {
    let socks5srv;
    let hasTlsConnection;
    let withUsernamePassword;

    beforeEach(async () => {
      hasTlsConnection = false;
      socks5srv = net.createServer(async socket => {
        if (withUsernamePassword) {
          expect(await once(socket, 'data')).to.deep.equal([Buffer.from('05020002', 'hex')]);
          socket.write(Buffer.from('0502', 'hex'));
          expect(await once(socket, 'data')).to.deep.equal([
            Buffer.concat([
              Buffer.from('0103', 'hex'),
              Buffer.from('foo'),
              Buffer.from('03', 'hex'),
              Buffer.from('bar')
            ])
          ]);
          socket.write(Buffer.from('0100', 'hex'));
        } else {
          expect(await once(socket, 'data')).to.deep.equal([Buffer.from('050100', 'hex')]);
          socket.write(Buffer.from('0500', 'hex'));
        }
        expect(await once(socket, 'data')).to.deep.equal([
          Buffer.concat([
            Buffer.from('0501000312', 'hex'),
            Buffer.from('some.fake.host.com'),
            Buffer.from('01bb', 'hex')
          ])
        ]);
        socket.write(Buffer.from('0500007f0000010100', 'hex'));
        expect((await once(socket, 'data'))[0][1]).to.equal(3); // TLS handshake version byte
        hasTlsConnection = true;
        socket.end();
      });
      socks5srv.listen(0);
      await once(socks5srv, 'listening');
    });

    afterEach(() => {
      socks5srv.close();
    });

    it('should create HTTPS connections through a Socks5 proxy (no proxy auth)', async function () {
      const stateMachine = new StateMachine({
        proxyOptions: {
          proxyHost: 'localhost',
          proxyPort: socks5srv.address().port
        }
      } as any);

      const request = new MockRequest(Buffer.from('foobar'), 500);
      try {
        await stateMachine.kmsRequest(request);
      } catch (err) {
        expect(err.name).to.equal('MongoCryptError');
        expect(err.cause.code).to.equal('ECONNRESET');
        expect(hasTlsConnection).to.equal(true);
        return;
      }
      expect.fail('missed exception');
    });

    it('should create HTTPS connections through a Socks5 proxy (username/password auth)', async function () {
      withUsernamePassword = true;
      const stateMachine = new StateMachine({
        proxyOptions: {
          proxyHost: 'localhost',
          proxyPort: socks5srv.address().port,
          proxyUsername: 'foo',
          proxyPassword: 'bar'
        }
      } as any);

      const request = new MockRequest(Buffer.from('foobar'), 500);
      try {
        await stateMachine.kmsRequest(request);
      } catch (err) {
        expect(err.name).to.equal('MongoCryptError');
        expect(err.cause.code).to.equal('ECONNRESET');
        expect(hasTlsConnection).to.equal(true);
        return;
      }
      expect.fail('missed exception');
    });
  });

  describe('CSOT', function () {
    describe('#fetchKeys', function () {
      const stateMachine = new StateMachine({} as any);
      const client = new MongoClient('mongodb://localhost:27017');
      let findSpy;

      beforeEach(async function () {
        findSpy = sinon.spy(Collection.prototype, 'find');
      });

      afterEach(async function () {
        sinon.restore();
        await client.close();
      });

      context('when StateMachine.fetchKeys() is passed a `CSOTimeoutContext`', function () {
        it('collection.find uses the provided timeout context', async function () {
          const context = new CSOTTimeoutContext({
            timeoutMS: 500,
            serverSelectionTimeoutMS: 30000
          });

          await stateMachine
            .fetchKeys(client, 'keyVault', BSON.serialize({ a: 1 }), { timeoutContext: context })
            .catch(e => squashError(e));

          const { timeoutContext } = findSpy.getCalls()[0].args[1] as FindOptions;
          expect(timeoutContext).to.be.instanceOf(CursorTimeoutContext);
          expect(timeoutContext.timeoutContext).to.equal(context);
        });
      });

      context('when StateMachine.fetchKeys() is not passed a `CSOTimeoutContext`', function () {
        it('a timeoutContext is not provided to the find cursor', async function () {
          await stateMachine
            .fetchKeys(client, 'keyVault', BSON.serialize({ a: 1 }))
            .catch(e => squashError(e));
          const { timeoutContext } = findSpy.getCalls()[0].args[1] as FindOptions;
          expect(timeoutContext).to.be.undefined;
        });
      });
    });

    describe('#markCommand', function () {
      const stateMachine = new StateMachine({} as any);
      const client = new MongoClient('mongodb://localhost:27017');
      let dbCommandSpy;

      beforeEach(async function () {
        dbCommandSpy = sinon.spy(Db.prototype, 'command');
      });

      afterEach(async function () {
        sinon.restore();
        await client.close();
      });

      context('when StateMachine.markCommand() is passed a `CSOTimeoutContext`', function () {
        it('db.command runs with its timeoutMS property set to remainingTimeMS', async function () {
          const timeoutContext = new CSOTTimeoutContext({
            timeoutMS: 500,
            serverSelectionTimeoutMS: 30000
          });
          await sleep(300);
          await stateMachine
            .markCommand(client, 'keyVault', BSON.serialize({ a: 1 }), { timeoutContext })
            .catch(e => squashError(e));
          expect(dbCommandSpy.getCalls()[0].args[1].timeoutMS).to.not.be.undefined;
          expect(dbCommandSpy.getCalls()[0].args[1].timeoutMS).to.be.lessThanOrEqual(205);
        });
      });

      context('when StateMachine.markCommand() is not passed a `CSOTimeoutContext`', function () {
        it('db.command runs with an undefined timeoutMS property', async function () {
          await stateMachine
            .markCommand(client, 'keyVault', BSON.serialize({ a: 1 }))
            .catch(e => squashError(e));
          expect(dbCommandSpy.getCalls()[0].args[1].timeoutMS).to.be.undefined;
        });
      });
    });

    describe('#fetchCollectionInfo', function () {
      const stateMachine = new StateMachine({} as any);
      const client = new MongoClient('mongodb://localhost:27017');
      let listCollectionsSpy;

      beforeEach(async function () {
        listCollectionsSpy = sinon.spy(Db.prototype, 'listCollections');
      });

      afterEach(async function () {
        sinon.restore();
        await client.close();
      });

      context(
        'when StateMachine.fetchCollectionInfo() is passed a `CSOTimeoutContext`',
        function () {
          it('listCollections uses the provided timeoutContext', async function () {
            const context = new CSOTTimeoutContext({
              timeoutMS: 500,
              serverSelectionTimeoutMS: 30000
            });
            await sleep(300);

            try {
              const cursor = stateMachine.fetchCollectionInfo(
                client,
                'keyVault',
                BSON.serialize({ a: 1 }),
                {
                  timeoutContext: context
                }
              );
              for await (const doc of cursor) void doc;
            } catch {
              // ignore
            }

            const [_filter, { timeoutContext }] = listCollectionsSpy.getCalls()[0].args;
            expect(timeoutContext).to.exist;
            expect(timeoutContext.timeoutContext).to.equal(context);
          });
        }
      );

      context(
        'when StateMachine.fetchCollectionInfo() is not passed a `CSOTimeoutContext`',
        function () {
          it('no timeoutContext is provided to listCollections', async function () {
            try {
              const cursor = stateMachine.fetchCollectionInfo(
                client,
                'keyVault',
                BSON.serialize({ a: 1 })
              );
              for await (const doc of cursor) void doc;
            } catch {
              // ignore
            }
            const [_filter, { timeoutContext }] = listCollectionsSpy.getCalls()[0].args;
            expect(timeoutContext).not.to.exist;
          });
        }
      );
    });
  });
});

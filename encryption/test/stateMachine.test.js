'use strict';

const { EventEmitter, once } = require('events');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const { expect } = require('chai');
const sinon = require('sinon');
const mongodb = require('mongodb');
const BSON = mongodb.BSON;
const StateMachine = require('../lib/stateMachine')({ mongodb }).StateMachine;

describe('StateMachine', function () {
  class MockRequest {
    constructor(message, bytesNeeded) {
      this._bytesNeeded = typeof bytesNeeded === 'number' ? bytesNeeded : 1024;
      this._message = message;
      this.endpoint = 'some.fake.host.com';
      this._kmsProvider = 'aws';
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

    addResponse(buffer) {
      this._bytesNeeded -= buffer.length;
    }
  }

  describe('#markCommand', function () {
    let runCommandStub;
    let dbStub;
    let clientStub;

    beforeEach(function () {
      this.sinon = sinon.createSandbox();
      runCommandStub = this.sinon.stub().resolves({});
      dbStub = this.sinon.createStubInstance(mongodb.Db, {
        command: runCommandStub
      });
      clientStub = this.sinon.createStubInstance(mongodb.MongoClient, {
        db: dbStub
      });
    });

    const command = {
      encryptedFields: {},
      a: new BSON.Long('0'),
      b: new BSON.Int32(0)
    };
    const options = { promoteLongs: false, promoteValues: false };
    const serializedCommand = BSON.serialize(command);
    const stateMachine = new StateMachine({ bson: BSON });
    const callback = () => {};

    context('when executing the command', function () {
      it('does not promote values', function () {
        stateMachine.markCommand(clientStub, 'test.coll', serializedCommand, callback);
        expect(runCommandStub.calledWith(command, options)).to.be.true;
      });
    });
  });

  describe('kmsRequest', function () {
    class MockSocket extends EventEmitter {
      constructor(callback) {
        super();
        this.on('connect', callback);
      }
      write() {}
      destroy() {}
      end(callback) {
        Promise.resolve().then(callback);
      }
    }

    before(function () {
      this.sinon = sinon.createSandbox();
    });

    context('when handling standard kms requests', function () {
      beforeEach(function () {
        this.fakeSocket = undefined;
        this.sinon.stub(tls, 'connect').callsFake((options, callback) => {
          this.fakeSocket = new MockSocket(callback);
          return this.fakeSocket;
        });
      });

      it('should only resolve once bytesNeeded drops to zero', function (done) {
        const stateMachine = new StateMachine({ bson: BSON });
        const request = new MockRequest(Buffer.from('foobar'), 500);
        let status = 'pending';
        stateMachine
          .kmsRequest(request)
          .then(
            () => (status = 'resolved'),
            () => (status = 'rejected')
          )
          .catch(() => {});

        this.fakeSocket.emit('connect');
        setTimeout(() => {
          expect(status).to.equal('pending');
          expect(request.bytesNeeded).to.equal(500);
          expect(request.kmsProvider).to.equal('aws');
          this.fakeSocket.emit('data', Buffer.alloc(300));
          setTimeout(() => {
            expect(status).to.equal('pending');
            expect(request.bytesNeeded).to.equal(200);
            this.fakeSocket.emit('data', Buffer.alloc(200));
            setTimeout(() => {
              expect(status).to.equal('resolved');
              expect(request.bytesNeeded).to.equal(0);
              done();
            });
          });
        });
      });
    });

    context('when tls options are provided', function () {
      context('when the options are insecure', function () {
        [
          'tlsInsecure',
          'tlsAllowInvalidCertificates',
          'tlsAllowInvalidHostnames',
          'tlsDisableOCSPEndpointCheck',
          'tlsDisableCertificateRevocationCheck'
        ].forEach(function (option) {
          context(`when the option is ${option}`, function () {
            const stateMachine = new StateMachine({
              bson: BSON,
              tlsOptions: { aws: { [option]: true } }
            });
            const request = new MockRequest(Buffer.from('foobar'), 500);

            it('rejects with the validation error', function (done) {
              stateMachine.kmsRequest(request).catch(err => {
                expect(err.message).to.equal(`Insecure TLS options prohibited for aws: ${option}`);
                done();
              });
            });
          });
        });
      });

      context('when the options are secure', function () {
        context('when providing tlsCertificateKeyFile', function () {
          const stateMachine = new StateMachine({
            bson: BSON,
            tlsOptions: { aws: { tlsCertificateKeyFile: 'test.pem' } }
          });
          const request = new MockRequest(Buffer.from('foobar'), -1);
          const buffer = Buffer.from('foobar');
          let connectOptions;

          it('sets the cert and key options in the tls connect options', function (done) {
            this.sinon.stub(fs, 'readFileSync').callsFake(fileName => {
              expect(fileName).to.equal('test.pem');
              return buffer;
            });
            this.sinon.stub(tls, 'connect').callsFake((options, callback) => {
              connectOptions = options;
              this.fakeSocket = new MockSocket(callback);
              return this.fakeSocket;
            });
            stateMachine.kmsRequest(request).then(function () {
              expect(connectOptions.cert).to.equal(buffer);
              expect(connectOptions.key).to.equal(buffer);
              done();
            });
            this.fakeSocket.emit('data', Buffer.alloc(0));
          });
        });

        context('when providing tlsCAFile', function () {
          const stateMachine = new StateMachine({
            bson: BSON,
            tlsOptions: { aws: { tlsCAFile: 'test.pem' } }
          });
          const request = new MockRequest(Buffer.from('foobar'), -1);
          const buffer = Buffer.from('foobar');
          let connectOptions;

          it('sets the ca options in the tls connect options', function (done) {
            this.sinon.stub(fs, 'readFileSync').callsFake(fileName => {
              expect(fileName).to.equal('test.pem');
              return buffer;
            });
            this.sinon.stub(tls, 'connect').callsFake((options, callback) => {
              connectOptions = options;
              this.fakeSocket = new MockSocket(callback);
              return this.fakeSocket;
            });
            stateMachine.kmsRequest(request).then(function () {
              expect(connectOptions.ca).to.equal(buffer);
              done();
            });
            this.fakeSocket.emit('data', Buffer.alloc(0));
          });
        });

        context('when providing tlsCertificateKeyFilePassword', function () {
          const stateMachine = new StateMachine({
            bson: BSON,
            tlsOptions: { aws: { tlsCertificateKeyFilePassword: 'test' } }
          });
          const request = new MockRequest(Buffer.from('foobar'), -1);
          let connectOptions;

          it('sets the passphrase option in the tls connect options', function (done) {
            this.sinon.stub(tls, 'connect').callsFake((options, callback) => {
              connectOptions = options;
              this.fakeSocket = new MockSocket(callback);
              return this.fakeSocket;
            });
            stateMachine.kmsRequest(request).then(function () {
              expect(connectOptions.passphrase).to.equal('test');
              done();
            });
            this.fakeSocket.emit('data', Buffer.alloc(0));
          });
        });
      });
    });

    afterEach(function () {
      this.sinon.restore();
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
        bson: BSON,
        proxyOptions: {
          proxyHost: 'localhost',
          proxyPort: socks5srv.address().port
        }
      });

      const request = new MockRequest(Buffer.from('foobar'), 500);
      try {
        await stateMachine.kmsRequest(request);
      } catch (err) {
        expect(err.name).to.equal('MongoCryptError');
        expect(err.originalError.code).to.equal('ECONNRESET');
        expect(hasTlsConnection).to.equal(true);
        return;
      }
      expect.fail('missed exception');
    });

    it('should create HTTPS connections through a Socks5 proxy (username/password auth)', async function () {
      withUsernamePassword = true;
      const stateMachine = new StateMachine({
        bson: BSON,
        proxyOptions: {
          proxyHost: 'localhost',
          proxyPort: socks5srv.address().port,
          proxyUsername: 'foo',
          proxyPassword: 'bar'
        }
      });

      const request = new MockRequest(Buffer.from('foobar'), 500);
      try {
        await stateMachine.kmsRequest(request);
      } catch (err) {
        expect(err.name).to.equal('MongoCryptError');
        expect(err.originalError.code).to.equal('ECONNRESET');
        expect(hasTlsConnection).to.equal(true);
        return;
      }
      expect.fail('missed exception');
    });
  });
});

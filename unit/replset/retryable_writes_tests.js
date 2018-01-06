'use strict';
var expect = require('chai').expect,
  ReplSet = require('../../../../lib/topologies/replset'),
  mock = require('mongodb-mock-server'),
  ReplSetFixture = require('../common').ReplSetFixture,
  ClientSession = require('../../../../lib/sessions').ClientSession,
  ServerSessionPool = require('../../../../lib/sessions').ServerSessionPool;

const test = new ReplSetFixture();
describe('Retryable Writes (ReplSet)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup({ ismaster: mock.DEFAULT_ISMASTER_36 }));

  it('should add `txnNumber` to write commands where `retryWrites` is true', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      var replset = new ReplSet(
        [test.primaryServer.address(), test.firstSecondaryServer.address()],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      const sessionPool = new ServerSessionPool(replset);
      const session = new ClientSession(replset, sessionPool);

      let command = null;
      test.primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(test.primaryStates[0]);
        } else if (doc.insert) {
          command = doc;
          request.reply({ ok: 1 });
        }
      });

      replset.on('all', () => {
        replset.insert('test.test', [{ a: 1 }], { retryWrites: true, session: session }, function(
          err
        ) {
          expect(err).to.not.exist;
          expect(command).to.have.property('txnNumber');
          expect(command.txnNumber).to.eql(1);

          replset.destroy();
          done();
        });
      });

      replset.on('error', done);
      replset.connect();
    }
  });

  it('should retry write commands where `retryWrites` is true, and not increment `txnNumber`', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      var replset = new ReplSet(
        [test.primaryServer.address(), test.firstSecondaryServer.address()],
        {
          setName: 'rs',
          connectionTimeout: 100,
          socketTimeout: 0,
          haInterval: 100,
          size: 5,
          minSize: 1
        }
      );

      const sessionPool = new ServerSessionPool(replset);
      const session = new ClientSession(replset, sessionPool);

      let command = null,
        insertCount = 0;

      test.primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(test.primaryStates[0]);
        } else if (doc.insert) {
          insertCount++;
          if (insertCount === 1) {
            request.connection.destroy();
          } else {
            command = doc;
            request.reply({ ok: 1 });
          }
        }
      });

      replset.on('all', () => {
        replset.insert('test.test', [{ a: 1 }], { retryWrites: true, session: session }, function(
          err
        ) {
          if (err) console.dir(err);
          expect(err).to.not.exist;
          expect(command).to.have.property('txnNumber');
          expect(command.txnNumber).to.eql(1);

          replset.destroy();
          done();
        });
      });

      replset.on('error', done);
      replset.connect();
    }
  });

  it('should retry write commands where `retryWrites` is true, and there is a "not master" error', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      var replset = new ReplSet(
        [test.primaryServer.address(), test.firstSecondaryServer.address()],
        {
          setName: 'rs',
          connectionTimeout: 100,
          socketTimeout: 0,
          haInterval: 100,
          size: 5,
          minSize: 1
        }
      );

      const sessionPool = new ServerSessionPool(replset);
      const session = new ClientSession(replset, sessionPool);

      let command = null,
        insertCount = 0;

      test.primaryServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(test.primaryStates[0]);
        } else if (doc.insert) {
          insertCount++;
          if (insertCount === 1) {
            request.reply({ ok: 0, errmsg: 'not master' }); // simulate a stepdown
          } else {
            command = doc;
            request.reply({ ok: 1 });
          }
        }
      });

      replset.on('all', () => {
        replset.insert('test.test', [{ a: 1 }], { retryWrites: true, session: session }, function(
          err
        ) {
          expect(err).to.not.exist;
          expect(command).to.have.property('txnNumber');
          expect(command.txnNumber).to.eql(1);

          replset.destroy();
          done();
        });
      });

      replset.on('error', done);
      replset.connect();
    }
  });
});

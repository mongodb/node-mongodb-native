'use strict';

const BSON = require('bson');
const mock = require('mongodb-mock-server');
const expect = require('chai').expect;
const EventEmitter = require('events');
const Connection = require('../../../lib/core/connection/connection');
const connect = require('../../../lib/core/connection/connect');
const MongoCredentials = require('../../../lib/core/auth/mongo_credentials').MongoCredentials;
const genClusterTime = require('./common').genClusterTime;
const MongoNetworkError = require('../../../lib/core/error').MongoNetworkError;

describe('Connect Tests', function() {
  const test = {};
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
      test.connectOptions = {
        host: test.server.host,
        port: test.server.port,
        bson: new BSON(),
        credentials: new MongoCredentials({
          username: 'testUser',
          password: 'pencil',
          source: 'admin',
          mechanism: 'plain'
        })
      };
    });
  });

  afterEach(() => mock.cleanup());
  it('should auth against a non-arbiter', function(done) {
    const whatHappened = {};

    test.server.setMessageHandler(request => {
      const doc = request.document;
      const $clusterTime = genClusterTime(Date.now());

      if (doc.ismaster || doc.hello) {
        whatHappened.ismaster = true;
        request.reply(
          Object.assign({}, mock.DEFAULT_ISMASTER, {
            $clusterTime
          })
        );
      } else if (doc.saslStart) {
        whatHappened.saslStart = true;
        request.reply({ ok: 1 });
      }
    });

    connect(test.connectOptions, err => {
      try {
        expect(whatHappened).to.have.property('ismaster', true);
        expect(whatHappened).to.have.property('saslStart', true);
      } catch (_err) {
        err = _err;
      }

      done(err);
    });
  });

  it('should not auth against an arbiter', function(done) {
    const whatHappened = {};
    test.server.setMessageHandler(request => {
      const doc = request.document;
      const $clusterTime = genClusterTime(Date.now());
      if (doc.ismaster || doc.hello) {
        whatHappened.ismaster = true;
        request.reply(
          Object.assign({}, mock.DEFAULT_ISMASTER, {
            $clusterTime,
            arbiterOnly: true
          })
        );
      } else if (doc.saslStart) {
        whatHappened.saslStart = true;
        request.reply({ ok: 0 });
      }
    });

    connect(test.connectOptions, err => {
      try {
        expect(whatHappened).to.have.property('ismaster', true);
        expect(whatHappened).to.not.have.property('saslStart');
      } catch (_err) {
        err = _err;
      }

      done(err);
    });
  });

  it('should emit `MongoNetworkError` for network errors', function(done) {
    connect({ host: 'non-existent', port: 27018 }, err => {
      expect(err).to.be.instanceOf(MongoNetworkError);
      done();
    });
  });

  it.skip('should allow a cancellaton token', {
    metadata: {
      requires: {
        os: '!win32' // NODE-2941: 240.0.0.1 doesnt work for windows
      }
    },
    test: function(done) {
      const cancellationToken = new EventEmitter();
      setTimeout(() => cancellationToken.emit('cancel'), 500);
      // set no response handler for mock server, effecively blackhole requests

      connect({ host: '240.0.0.1' }, cancellationToken, (err, conn) => {
        expect(err).to.exist;
        expect(err).to.match(/connection establishment was cancelled/);
        expect(conn).to.not.exist;
        done();
      });
    }
  });

  describe('runCommand', function() {
    const metadata = { requires: { topology: 'single' } };

    it('should treat non-Error generating error-like events as errors', metadata, function(done) {
      class ConnectionFailingWithClose extends Connection {
        constructor(conn) {
          super(conn, { bson: new BSON() });
        }

        write() {
          this.emit('close');
        }
      }

      connect(
        { host: '127.0.0.1', port: 27017, connectionType: ConnectionFailingWithClose },
        (err, conn) => {
          expect(err).to.exist;
          expect(err.message).to.match(/runCommand failed/);
          expect(conn).to.not.exist;
          done();
        }
      );
    });

    it(
      'should not crash the application if multiple error-like events are emitted on `runCommand`',
      metadata,
      function(done) {
        class ConnectionFailingWithAllEvents extends Connection {
          constructor(conn) {
            super(conn, { bson: new BSON() });
          }

          write() {
            this.emit('close');
            this.emit('timeout');
            this.emit('error');
          }
        }

        connect(
          { host: '127.0.0.1', port: 27017, connectionType: ConnectionFailingWithAllEvents },
          (err, conn) => {
            expect(err).to.exist;
            expect(conn).to.not.exist;
            done();
          }
        );
      }
    );
  });
});

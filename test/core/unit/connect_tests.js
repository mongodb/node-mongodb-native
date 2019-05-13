'use strict';

const BSON = require('bson');
const mock = require('mongodb-mock-server');
const expect = require('chai').expect;

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

      if (doc.ismaster) {
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
      if (doc.ismaster) {
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
});

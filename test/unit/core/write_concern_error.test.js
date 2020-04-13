'use strict';
const ReplSet = require('../../../lib/core/topologies/replset');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('./common').ReplSetFixture;
const MongoWriteConcernError = require('../../../lib/core/error').MongoWriteConcernError;
const expect = require('chai').expect;

describe('WriteConcernError', function() {
  let test;

  // mock ops store from node-mongodb-native
  const mockDisconnectHandler = {
    add: () => {},
    execute: () => {},
    flush: () => {}
  };

  const RAW_USER_WRITE_CONCERN_CMD = {
    createUser: 'foo2',
    pwd: 'pwd',
    roles: ['read'],
    writeConcern: { w: 'majority', wtimeout: 1 }
  };

  const RAW_USER_WRITE_CONCERN_ERROR = {
    ok: 0,
    errmsg: 'waiting for replication timed out',
    code: 64,
    codeName: 'WriteConcernFailed',
    writeConcernError: {
      code: 64,
      codeName: 'WriteConcernFailed',
      errmsg: 'waiting for replication timed out',
      errInfo: {
        wtimeout: true
      }
    }
  };

  const RAW_USER_WRITE_CONCERN_ERROR_INFO = {
    ok: 0,
    errmsg: 'waiting for replication timed out',
    code: 64,
    codeName: 'WriteConcernFailed',
    writeConcernError: {
      code: 64,
      codeName: 'WriteConcernFailed',
      errmsg: 'waiting for replication timed out',
      errInfo: {
        writeConcern: {
          w: 2,
          wtimeout: 0,
          provenance: 'clientSupplied'
        }
      }
    }
  };

  before(() => (test = new ReplSetFixture()));
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup());

  function makeAndConnectReplSet(cb) {
    let invoked = false;

    const replSet = new ReplSet(
      [test.primaryServer.address(), test.firstSecondaryServer.address()],
      {
        setName: 'rs',
        haInterval: 10000,
        connectionTimeout: 3000,
        disconnectHandler: mockDisconnectHandler,
        secondaryOnlyConnectionAllowed: true,
        size: 1
      }
    );

    replSet.once('error', err => {
      if (invoked) {
        return;
      }
      invoked = true;
      cb(err, null);
    });
    replSet.on('connect', () => {
      if (invoked || !replSet.s.replicaSetState.hasPrimary()) {
        return;
      }
      invoked = true;
      cb(null, replSet);
    });

    replSet.connect();
  }

  it('should expose a user command writeConcern error like a normal WriteConcernError', function(done) {
    test.primaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        setTimeout(() => request.reply(test.primaryStates[0]));
      } else if (doc.createUser) {
        setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR));
      }
    });

    makeAndConnectReplSet((err, replSet) => {
      // cleanup the server before calling done
      const cleanup = err => replSet.destroy(err2 => done(err || err2));

      if (err) {
        return cleanup(err);
      }

      replSet.command('db1', Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), err => {
        let _err;
        try {
          expect(err).to.be.an.instanceOf(MongoWriteConcernError);
          expect(err.result).to.exist;
          expect(err.result).to.have.property('ok', 1);
          expect(err.result).to.not.have.property('errmsg');
          expect(err.result).to.not.have.property('code');
          expect(err.result).to.not.have.property('codeName');
        } catch (e) {
          _err = e;
        } finally {
          cleanup(_err);
        }
      });
    });
  });

  it('should propagate writeConcernError.errInfo ', function(done) {
    test.primaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        setTimeout(() => request.reply(test.primaryStates[0]));
      } else if (doc.createUser) {
        setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR_INFO));
      }
    });

    makeAndConnectReplSet((err, replSet) => {
      // cleanup the server before calling done
      const cleanup = err => replSet.destroy(err2 => done(err || err2));

      if (err) {
        return cleanup(err);
      }

      replSet.command('db1', Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), err => {
        let _err;
        try {
          expect(err).to.be.an.instanceOf(MongoWriteConcernError);
          expect(err.result).to.exist;
          expect(err.result.writeConcernError).to.deep.equal(
            RAW_USER_WRITE_CONCERN_ERROR_INFO.writeConcernError
          );
        } catch (e) {
          _err = e;
        } finally {
          cleanup(_err);
        }
      });
    });
  });
});

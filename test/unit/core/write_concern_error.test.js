'use strict';
const { Topology } = require('../../../src/sdam/topology');
const mock = require('mongodb-mock-server');
const { ReplSetFixture } = require('./common');
const { MongoWriteConcernError } = require('../../../src/error');
const { expect } = require('chai');
const { ns } = require('../../../src/utils');

describe('WriteConcernError', function () {
  let test;
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
    const replSet = new Topology(
      [test.primaryServer.address(), test.firstSecondaryServer.address()],
      { replicaSet: 'rs' }
    );

    replSet.once('error', err => {
      if (invoked) {
        return;
      }
      invoked = true;
      cb(err);
    });

    replSet.on('connect', () => {
      if (invoked) {
        return;
      }

      invoked = true;
      cb(undefined, replSet);
    });

    replSet.connect();
  }

  it('should expose a user command writeConcern error like a normal WriteConcernError', function (done) {
    test.primaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        setTimeout(() => request.reply(test.primaryStates[0]));
      } else if (doc.createUser) {
        setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR));
      }
    });

    makeAndConnectReplSet((err, topology) => {
      // cleanup the server before calling done
      const cleanup = err => topology.close({ force: true }, err2 => done(err || err2));

      if (err) {
        return cleanup(err);
      }

      topology.selectServer('primary', (err, server) => {
        expect(err).to.not.exist;

        server.command(ns('db1'), Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), err => {
          let _err;
          try {
            expect(err).to.be.an.instanceOf(MongoWriteConcernError);
            expect(err.result).to.exist;
            expect(err.result).to.have.property('ok', 1);
            expect(err.result).to.not.have.property('errmsg');
            expect(err.result).to.not.have.property('code');
            expect(err.result).to.not.have.property('codeName');
            expect(err.result).to.have.property('writeConcernError');
          } catch (e) {
            _err = e;
          } finally {
            cleanup(_err);
          }
        });
      });
    });
  });

  it('should propagate writeConcernError.errInfo ', function (done) {
    test.primaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        setTimeout(() => request.reply(test.primaryStates[0]));
      } else if (doc.createUser) {
        setTimeout(() => request.reply(RAW_USER_WRITE_CONCERN_ERROR_INFO));
      }
    });

    makeAndConnectReplSet((err, topology) => {
      // cleanup the server before calling done
      const cleanup = err => topology.close(err2 => done(err || err2));

      if (err) {
        return cleanup(err);
      }

      topology.selectServer('primary', (err, server) => {
        expect(err).to.not.exist;

        server.command(ns('db1'), Object.assign({}, RAW_USER_WRITE_CONCERN_CMD), err => {
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
});

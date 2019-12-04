'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const ObjectId = require('../../index').ObjectId;
const Timestamp = require('../../index').Timestamp;
const Long = require('../../index').Long;
const GET_MORE_NON_RESUMABLE_CODES = require('../../lib/error').GET_MORE_NON_RESUMABLE_CODES;
const isResumableError = require('../../lib/error').isResumableError;

describe('Change Stream Resume Tests', function() {
  const test = {};
  const DEFAULT_IS_MASTER = Object.assign({}, mock.DEFAULT_ISMASTER, {
    setName: 'rs',
    setVersion: 1,
    maxWireVersion: 7,
    secondary: false
  });

  const AGGREGATE_RESPONSE = {
    ok: 1,
    cursor: {
      firstBatch: [],
      id: new Long('9064341847921713401'),
      ns: 'test.test'
    },
    operationTime: new Timestamp(1527200325, 1),
    $clusterTime: {
      clusterTime: new Timestamp(1527200325, 1),
      signature: {
        keyId: new Long(0)
      }
    }
  };

  const CHANGE_DOC = {
    _id: {
      ts: new Timestamp(4, 1501511802),
      ns: 'integration_tests.docsDataEvent',
      _id: new ObjectId('597f407a8fd4abb616feca93')
    },
    operationType: 'insert',
    ns: {
      db: 'integration_tests',
      coll: 'docsDataEvent'
    },
    fullDocument: {
      _id: new ObjectId('597f407a8fd4abb616feca93'),
      a: 1,
      counter: 0
    }
  };

  const GET_MORE_RESPONSE = {
    ok: 1,
    cursor: {
      nextBatch: [CHANGE_DOC],
      id: new Long('9064341847921713401'),
      ns: 'test.test'
    },
    operationTime: new Timestamp(1527200325, 1),
    $clusterTime: {
      clusterTime: new Timestamp(1527200325, 1),
      signature: {
        keyId: new Long(0)
      }
    }
  };

  function makeIsMaster(server) {
    const uri = server.uri();

    return Object.assign({}, DEFAULT_IS_MASTER, {
      hosts: [uri],
      me: uri,
      primary: uri
    });
  }

  function makeServerHandler(config) {
    let firstGetMore = true;
    let firstAggregate = true;
    return request => {
      const doc = request.document;

      if (doc.ismaster) {
        return request.reply(makeIsMaster(test.server));
      }
      if (doc.endSessions) {
        return request.reply({ ok: 1 });
      }
      if (doc.aggregate) {
        if (firstAggregate) {
          firstAggregate = false;
          return config.firstAggregate(request);
        }
        return config.secondAggregate(request);
      }
      if (doc.getMore) {
        if (firstGetMore) {
          firstGetMore = false;
          return config.firstGetMore(request);
        }
        return config.secondGetMore(request);
      }
    };
  }

  const RESUMABLE_ERROR_CODES = [1, 40, 20000];

  const configs = RESUMABLE_ERROR_CODES.map(code => ({
    description: `should resume on error code ${code}`,
    passing: true,
    firstAggregate: req => req.reply(AGGREGATE_RESPONSE),
    secondAggregate: req => req.reply(AGGREGATE_RESPONSE),
    firstGetMore: req => req.reply({ ok: 0, errmsg: 'firstGetMoreError', code }),
    secondGetMore: req => req.reply(GET_MORE_RESPONSE)
  }))
    .concat([
      {
        description: `should resume on a network error`,
        passing: true,
        firstAggregate: req => req.reply(AGGREGATE_RESPONSE),
        secondAggregate: req => req.reply(AGGREGATE_RESPONSE),
        firstGetMore: () => {}, // Simulates a timeout
        secondGetMore: req => req.reply(GET_MORE_RESPONSE)
      },
      {
        description: `should resume on an error that says 'not master'`,
        passing: true,
        firstAggregate: req => req.reply(AGGREGATE_RESPONSE),
        secondAggregate: req => req.reply(AGGREGATE_RESPONSE),
        firstGetMore: req => req.reply({ ok: 0, errmsg: 'not master' }),
        secondGetMore: req => req.reply(GET_MORE_RESPONSE)
      },
      {
        description: `should resume on an error that says 'node is recovering'`,
        passing: true,
        firstAggregate: req => req.reply(AGGREGATE_RESPONSE),
        secondAggregate: req => req.reply(AGGREGATE_RESPONSE),
        firstGetMore: req => req.reply({ ok: 0, errmsg: 'node is recovering' }),
        secondGetMore: req => req.reply(GET_MORE_RESPONSE)
      }
    ])
    .concat(
      Array.from(GET_MORE_NON_RESUMABLE_CODES).map(code => ({
        description: `should not resume on error code ${code}`,
        passing: false,
        errmsg: 'firstGetMoreError',
        firstAggregate: req => req.reply(AGGREGATE_RESPONSE),
        secondAggregate: req =>
          req.reply({ ok: 0, errmsg: 'We should not have a second aggregate' }),
        firstGetMore: req => req.reply({ ok: 0, errmsg: 'firstGetMoreError', code }),
        secondGetMore: req => req.reply({ ok: 0, errmsg: 'We should not have a second getMore' })
      }))
    )
    .concat(
      RESUMABLE_ERROR_CODES.map(code => ({
        description: `should not resume on aggregate, even for valid code ${code}`,
        passing: false,
        errmsg: 'fail aggregate',
        firstAggregate: req => req.reply({ ok: 0, errmsg: 'fail aggregate', code }),
        secondAggregate: req =>
          req.reply({ ok: 0, errmsg: 'We should not have a second aggregate' }),
        firstGetMore: req => req.reply({ ok: 0, errmsg: 'We should not have a first getMore' }),
        secondGetMore: req => req.reply({ ok: 0, errmsg: 'We should not have a second getMore' })
      }))
    );

  let client;
  let changeStream;

  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;
    });
  });

  afterEach(done => changeStream.close(() => client.close(() => mock.cleanup(done))));

  configs.forEach(config => {
    it(config.description, {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        const configuration = this.configuration;
        if (!configuration.usingUnifiedTopology()) {
          // These tests take way too long with the non-unified topology, so we will skip them
          return this.skip();
        }
        test.server.setMessageHandler(makeServerHandler(config));
        client = configuration.newClient(`mongodb://${test.server.uri()}`, {
          socketTimeoutMS: 300
        });
        return client
          .connect()
          .then(client => client.db('test'))
          .then(db => db.collection('test'))
          .then(collection => collection.watch())
          .then(_changeStream => (changeStream = _changeStream))
          .then(() => changeStream.next())
          .then(
            change => {
              if (!config.passing) {
                throw new Error('Expected test to not pass');
              }

              expect(change).to.deep.equal(CHANGE_DOC);
            },
            err => {
              if (config.passing) {
                throw err;
              }

              expect(err).to.have.property('errmsg', config.errmsg);
            }
          );
      }
    });
  });
});

describe('Change Stream Resume Error Tests', function() {
  it('should properly process errors that lack the `mongoErrorContextSymbol`', function() {
    expect(() => isResumableError(new Error())).to.not.throw();
  });
});

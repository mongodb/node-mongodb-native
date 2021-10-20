'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const Long = require('../../lib/core').BSON.Long;
const Timestamp = require('../../lib/core').BSON.Timestamp;
const common = require('../../lib/bulk/common');
const BulkWriteResult = common.BulkWriteResult;
const mergeBatchResults = common.mergeBatchResults;

describe('Bulk Writes', function() {
  const test = {};

  let documents;
  before(() => {
    documents = new Array(20000).fill('').map(() => ({
      arr: new Array(19).fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    }));
  });

  beforeEach(() => {
    return mock.createServer().then(server => {
      test.server = server;
    });
  });
  afterEach(() => mock.cleanup());

  it('should propagate errors', function(done) {
    const client = this.configuration.newClient(`mongodb://${test.server.uri()}/test`);

    let close = e => {
      close = () => {};
      client.close(() => done(e));
    };

    let hasErrored = false;

    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster || doc.hello) {
        request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      } else if (doc.insert) {
        if (hasErrored) {
          return request.reply({ ok: 1 });
        }
        hasErrored = true;
        return request.reply({ ok: 0 });
      } else {
        close(`Received unknown command ${doc}`);
      }
    });

    client.connect(function(err) {
      expect(err).to.be.null;

      const coll = client.db('foo').collection('bar');

      coll.insert(documents, { ordered: false }, function(err) {
        try {
          expect(err).to.be.an.instanceOf(Error);
          close();
        } catch (e) {
          close(e);
        }
      });
    });
  });

  it('should cache the upsertedIds in result', function() {
    const result = new BulkWriteResult({
      upserted: [
        { index: 0, _id: 1 },
        { index: 1, _id: 2 },
        { index: 2, _id: 3 }
      ]
    });

    const bulkWriteResultSymbols = Object.getOwnPropertySymbols(result);

    expect(bulkWriteResultSymbols.length).to.be.equal(2);

    const kUpsertedIds = bulkWriteResultSymbols.filter(
      s => s.toString() === 'Symbol(upsertedIds)'
    )[0];

    expect(kUpsertedIds).to.be.a('symbol');

    expect(result[kUpsertedIds]).to.equal(undefined);

    const upsertedIds = result.upsertedIds; // calls getter

    expect(upsertedIds).to.be.a('object');

    expect(result[kUpsertedIds]).to.equal(upsertedIds);

    Object.freeze(result); // If the getters try to write to `this`
    Object.freeze(result[kUpsertedIds]);
    // or either cached object then they will throw in these expects:

    expect(() => result.upsertedIds).to.not.throw();
  });

  it('should cache the insertedIds in result', function() {
    const result = new BulkWriteResult({
      insertedIds: [
        { index: 0, _id: 4 },
        { index: 1, _id: 5 },
        { index: 2, _id: 6 }
      ]
    });

    const bulkWriteResultSymbols = Object.getOwnPropertySymbols(result);

    expect(bulkWriteResultSymbols.length).to.be.equal(2);

    const kInsertedIds = bulkWriteResultSymbols.filter(
      s => s.toString() === 'Symbol(insertedIds)'
    )[0];

    expect(kInsertedIds).to.be.a('symbol');

    expect(result[kInsertedIds]).to.equal(undefined);

    const insertedIds = result.insertedIds; // calls getter

    expect(insertedIds).to.be.a('object');

    expect(result[kInsertedIds]).to.equal(insertedIds);

    Object.freeze(result); // If the getters try to write to `this`
    Object.freeze(result[kInsertedIds]);
    // or either cached object then they will throw in these expects:

    expect(() => result.insertedIds).to.not.throw();
  });

  describe('#mergeBatchResults', function() {
    let opTime;
    let lastOp;
    const bulkResult = {
      ok: 1,
      writeErrors: [],
      writeConcernErrors: [],
      insertedIds: [],
      nInserted: 0,
      nUpserted: 0,
      nMatched: 0,
      nModified: 0,
      nRemoved: 1,
      upserted: []
    };
    const result = {
      n: 8,
      nModified: 8,
      electionId: '7fffffff0000000000000028',
      ok: 1,
      $clusterTime: {
        clusterTime: '7020546605669417498',
        signature: {
          hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          keyId: 0
        }
      },
      operationTime: '7020546605669417498'
    };
    const batch = [];

    context('when lastOp is an object', function() {
      context('when the opTime is a Timestamp', function() {
        before(function() {
          lastOp = { ts: 7020546605669417496, t: 10 };
          opTime = Timestamp.fromNumber(8020546605669417496);
          bulkResult.lastOp = lastOp;
          result.opTime = opTime;
        });

        it('replaces the lastOp with the properly formatted object', function() {
          mergeBatchResults(batch, bulkResult, null, result);
          expect(bulkResult.lastOp).to.deep.equal({ ts: opTime, t: Long.ZERO });
        });
      });

      context('when the opTime is an object', function() {
        context('when the ts is greater', function() {
          before(function() {
            lastOp = { ts: 7020546605669417496, t: 10 };
            opTime = { ts: 7020546605669417497, t: 10 };
            bulkResult.lastOp = lastOp;
            result.opTime = opTime;
          });

          it('replaces the lastOp with the new opTime', function() {
            mergeBatchResults(batch, bulkResult, null, result);
            expect(bulkResult.lastOp).to.deep.equal(opTime);
          });
        });

        context('when the ts is equal', function() {
          context('when the t is greater', function() {
            before(function() {
              lastOp = { ts: 7020546605669417496, t: 10 };
              opTime = { ts: 7020546605669417496, t: 20 };
              bulkResult.lastOp = lastOp;
              result.opTime = opTime;
            });

            it('replaces the lastOp with the new opTime', function() {
              mergeBatchResults(batch, bulkResult, null, result);
              expect(bulkResult.lastOp).to.deep.equal(opTime);
            });
          });

          context('when the t is equal', function() {
            before(function() {
              lastOp = { ts: 7020546605669417496, t: 10 };
              opTime = { ts: 7020546605669417496, t: 10 };
              bulkResult.lastOp = lastOp;
              result.opTime = opTime;
            });

            it('does not replace the lastOp with the new opTime', function() {
              mergeBatchResults(batch, bulkResult, null, result);
              expect(bulkResult.lastOp).to.deep.equal(lastOp);
            });
          });

          context('when the t is less', function() {
            before(function() {
              lastOp = { ts: 7020546605669417496, t: 10 };
              opTime = { ts: 7020546605669417496, t: 5 };
              bulkResult.lastOp = lastOp;
              result.opTime = opTime;
            });

            it('does not replace the lastOp with the new opTime', function() {
              mergeBatchResults(batch, bulkResult, null, result);
              expect(bulkResult.lastOp).to.deep.equal(lastOp);
            });
          });
        });

        context('when the ts is less', function() {
          before(function() {
            lastOp = { ts: 7020546605669417496, t: 10 };
            opTime = { ts: 7020546605669417495, t: 10 };
            bulkResult.lastOp = lastOp;
            result.opTime = opTime;
          });

          it('does not replace the lastOp with the new opTime', function() {
            mergeBatchResults(batch, bulkResult, null, result);
            expect(bulkResult.lastOp).to.deep.equal(lastOp);
          });
        });
      });
    });
  });
});

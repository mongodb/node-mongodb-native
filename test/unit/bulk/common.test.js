/* eslint-disable no-loss-of-precision */
/* eslint-disable @typescript-eslint/no-loss-of-precision */
// TODO(NODE-3774): Lower the integer literals below JS max precision
'use strict';

const { expect } = require('chai');
const { mergeBatchResults } = require('../../../src/bulk/common');
const { Timestamp, Long } = require('../../../src/bson');

describe('bulk/common', function () {
  describe('#mergeBatchResults', function () {
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

    context('when lastOp is an object', function () {
      context('when the opTime is a Timestamp', function () {
        before(function () {
          lastOp = { ts: 7020546605669417496, t: 10 };
          opTime = Timestamp.fromNumber(8020546605669417496);
          bulkResult.opTime = lastOp;
          result.opTime = opTime;
        });

        it('replaces the opTime with the properly formatted object', function () {
          mergeBatchResults(batch, bulkResult, null, result);
          expect(bulkResult.opTime).to.deep.equal({ ts: opTime, t: Long.ZERO });
        });
      });

      context('when the opTime is an object', function () {
        context('when the ts is greater', function () {
          before(function () {
            lastOp = { ts: 7020546605669417496, t: 10 };
            opTime = { ts: 7020546605669417497, t: 10 };
            bulkResult.opTime = lastOp;
            result.opTime = opTime;
          });

          it('replaces the opTime with the new opTime', function () {
            mergeBatchResults(batch, bulkResult, null, result);
            expect(bulkResult.opTime).to.deep.equal(opTime);
          });
        });

        context('when the ts is equal', function () {
          context('when the t is greater', function () {
            before(function () {
              lastOp = { ts: 7020546605669417496, t: 10 };
              opTime = { ts: 7020546605669417496, t: 20 };
              bulkResult.opTime = lastOp;
              result.opTime = opTime;
            });

            it('replaces the opTime with the new opTime', function () {
              mergeBatchResults(batch, bulkResult, null, result);
              expect(bulkResult.opTime).to.deep.equal(opTime);
            });
          });

          context('when the t is equal', function () {
            before(function () {
              lastOp = { ts: 7020546605669417496, t: 10 };
              opTime = { ts: 7020546605669417496, t: 10 };
              bulkResult.opTime = lastOp;
              result.opTime = opTime;
            });

            it('does not replace the opTime with the new opTime', function () {
              mergeBatchResults(batch, bulkResult, null, result);
              expect(bulkResult.opTime).to.deep.equal(lastOp);
            });
          });

          context('when the t is less', function () {
            before(function () {
              lastOp = { ts: 7020546605669417496, t: 10 };
              opTime = { ts: 7020546605669417496, t: 5 };
              bulkResult.opTime = lastOp;
              result.opTime = opTime;
            });

            it('does not replace the opTime with the new opTime', function () {
              mergeBatchResults(batch, bulkResult, null, result);
              expect(bulkResult.opTime).to.deep.equal(lastOp);
            });
          });
        });

        context('when the ts is less', function () {
          before(function () {
            lastOp = { ts: 7020546605669417496, t: 10 };
            opTime = { ts: 7020546605669417495, t: 10 };
            bulkResult.opTime = lastOp;
            result.opTime = opTime;
          });

          it('does not replace the opTime with the new opTime', function () {
            mergeBatchResults(batch, bulkResult, null, result);
            expect(bulkResult.opTime).to.deep.equal(lastOp);
          });
        });
      });
    });
  });
});

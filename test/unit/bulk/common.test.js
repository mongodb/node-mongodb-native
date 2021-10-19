'use strict';

const { expect } = require('chai');
const { mergeBatchResults } = require('../../../src/bulk/common');
const { Timestamp, Long } = require('../../../src/bson');

describe('bulk/common', function () {
  describe('#mergeBatchResults', function () {
    context('when opTime is an object', function () {
      context('when the opTime on the result is a Timestamp', function () {
        const batch = [];
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
          upserted: [],
          opTime: {
            ts: 7020546605669417496,
            t: 10
          }
        };
        const result = {
          n: 8,
          nModified: 8,
          opTime: Timestamp.fromNumber(8020546605669417496),
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

        it('replaces the opTime with the properly formatted timestamp', function () {
          mergeBatchResults(batch, bulkResult, null, result);
          expect(bulkResult.opTime.t).to.equal(Long.ZERO);
        });
      });
    });
  });
});

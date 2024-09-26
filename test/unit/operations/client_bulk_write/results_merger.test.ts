import { expect } from 'chai';

import {
  BSON,
  ClientBulkWriteCursorResponse,
  type ClientBulkWriteResult,
  ClientBulkWriteResultsMerger,
  Long
} from '../../../mongodb';

describe('ClientBulkWriteResultsMerger', function () {
  describe('#constructor', function () {
    const resultsMerger = new ClientBulkWriteResultsMerger({});

    it('initializes the result', function () {
      expect(resultsMerger.result).to.deep.equal({
        insertedCount: 0,
        upsertedCount: 0,
        matchedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        deleteResults: undefined,
        insertResults: undefined,
        updateResults: undefined
      });
    });
  });

  describe('#merge', function () {
    context('when the bulk write is acknowledged', function () {
      context('when requesting verbose results', function () {
        // An example verbose response from the server without errors:
        // {
        //   cursor: {
        //     id: Long('0'),
        //     firstBatch: [ { ok: 1, idx: 0, n: 1 }, { ok: 1, idx: 1, n: 1 } ],
        //     ns: 'admin.$cmd.bulkWrite'
        //   },
        //   nErrors: 0,
        //   nInserted: 2,
        //   nMatched: 0,
        //   nModified: 0,
        //   nUpserted: 0,
        //   nDeleted: 0,
        //   ok: 1
        // }
        context('when there are no errors', function () {
          const operations = [
            { insert: 0, document: { _id: 1 } },
            { update: 0 },
            { update: 0 },
            { delete: 0 }
          ];
          const documents = [
            { ok: 1, idx: 0, n: 1 }, // Insert
            { ok: 1, idx: 1, n: 1, nModified: 1 }, // Update match
            { ok: 1, idx: 2, n: 0, upserted: { _id: 1 } }, // Update no match with upsert
            { ok: 1, idx: 3, n: 1 } // Delete
          ];
          const serverResponse = {
            cursor: {
              id: new Long('0'),
              firstBatch: documents,
              ns: 'admin.$cmd.bulkWrite'
            },
            nErrors: 0,
            nInserted: 1,
            nMatched: 1,
            nModified: 1,
            nUpserted: 1,
            nDeleted: 1,
            ok: 1
          };
          const response = new ClientBulkWriteCursorResponse(BSON.serialize(serverResponse), 0);
          const merger = new ClientBulkWriteResultsMerger({ verboseResults: true });
          let result: ClientBulkWriteResult;

          before(function () {
            result = merger.merge(operations, response, documents);
          });

          it('merges the inserted count', function () {
            expect(result.insertedCount).to.equal(1);
          });

          it('sets insert results', function () {
            expect(result.insertResults.get(0).insertedId).to.equal(1);
          });

          it('merges the upserted count', function () {
            expect(result.upsertedCount).to.equal(1);
          });

          it('merges the matched count', function () {
            expect(result.matchedCount).to.equal(1);
          });

          it('merges the modified count', function () {
            expect(result.modifiedCount).to.equal(1);
          });

          it('sets the update results', function () {
            expect(result.updateResults.get(1)).to.deep.equal({
              matchedCount: 1,
              modifiedCount: 1,
              didUpsert: false
            });
          });

          it('sets the upsert results', function () {
            expect(result.updateResults.get(2)).to.deep.equal({
              matchedCount: 0,
              modifiedCount: 0,
              upsertedId: 1,
              didUpsert: true
            });
          });

          it('merges the deleted count', function () {
            expect(result.deletedCount).to.equal(1);
          });

          it('sets the delete results', function () {
            expect(result.deleteResults.get(3).deletedCount).to.equal(1);
          });
        });
      });

      context('when not requesting verbose results', function () {
        // An example verbose response from the server without errors:
        // {
        //   cursor: {
        //     id: Long('0'),
        //     firstBatch: [],
        //     ns: 'admin.$cmd.bulkWrite'
        //   },
        //   nErrors: 0,
        //   nInserted: 2,
        //   nMatched: 0,
        //   nModified: 0,
        //   nUpserted: 0,
        //   nDeleted: 0,
        //   ok: 1
        // }
        context('when there are no errors', function () {
          const operations = [
            { insert: 0, document: { _id: 1 } },
            { update: 0 },
            { update: 0 },
            { delete: 0 }
          ];
          const documents = [];
          const serverResponse = {
            cursor: {
              id: new Long('0'),
              firstBatch: documents,
              ns: 'admin.$cmd.bulkWrite'
            },
            nErrors: 0,
            nInserted: 1,
            nMatched: 1,
            nModified: 1,
            nUpserted: 1,
            nDeleted: 1,
            ok: 1
          };
          const response = new ClientBulkWriteCursorResponse(BSON.serialize(serverResponse), 0);
          const merger = new ClientBulkWriteResultsMerger({ verboseResults: false });
          let result: ClientBulkWriteResult;

          before(function () {
            result = merger.merge(operations, response, documents);
          });

          it('merges the inserted count', function () {
            expect(result.insertedCount).to.equal(1);
          });

          it('sets no insert results', function () {
            expect(result.insertResults).to.equal(undefined);
          });

          it('merges the upserted count', function () {
            expect(result.upsertedCount).to.equal(1);
          });

          it('merges the matched count', function () {
            expect(result.matchedCount).to.equal(1);
          });

          it('merges the modified count', function () {
            expect(result.modifiedCount).to.equal(1);
          });

          it('sets no update results', function () {
            expect(result.updateResults).to.equal(undefined);
          });

          it('merges the deleted count', function () {
            expect(result.deletedCount).to.equal(1);
          });

          it('sets no delete results', function () {
            expect(result.deleteResults).to.equal(undefined);
          });
        });
      });
    });
  });
});

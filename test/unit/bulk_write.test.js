'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const BulkWriteResult = require('../../lib/bulk/common').BulkWriteResult;

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
      if (doc.ismaster) {
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

  it('should cache the insertedIds and upsertedIds in result', function() {
    const result = new BulkWriteResult({
      upserted: [
        { index: 0, _id: 1 },
        { index: 1, _id: 2 },
        { index: 2, _id: 3 }
      ],
      insertedIds: [
        { index: 0, _id: 4 },
        { index: 1, _id: 5 },
        { index: 2, _id: 6 }
      ]
    });

    const kUpsertedIds = Object.getOwnPropertySymbols(result).filter(
      s => s.description === 'upsertedIds'
    )[0];
    const kInsertedIds = Object.getOwnPropertySymbols(result).filter(
      s => s.description === 'insertedIds'
    )[0];

    expect(result[kUpsertedIds]).to.equal(undefined);
    expect(result[kInsertedIds]).to.equal(undefined);

    const upsertedIds = result.upsertedIds; // calls getter
    const insertedIds = result.insertedIds; // calls getter

    expect(upsertedIds).to.be.a('object');
    expect(insertedIds).to.be.a('object');

    expect(result[kUpsertedIds]).to.equal(upsertedIds);
    expect(result[kInsertedIds]).to.equal(insertedIds);

    Object.freeze(result); // If the getters try to write to `this`
    Object.freeze(result[kUpsertedIds]); // or either cached object
    Object.freeze(result[kInsertedIds]); // then they will throw in these expects:

    expect(() => result.upsertedIds).to.not.throw();
    expect(() => result.insertedIds).to.not.throw();
  });
});

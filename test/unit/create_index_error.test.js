'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');

describe('CreateIndexError', function() {
  const test = {};
  beforeEach(() => mock.createServer().then(_server => (test.server = _server)));
  afterEach(() => mock.cleanup());

  it('should error when createIndex fails', function(done) {
    const ERROR_RESPONSE = {
      ok: 0,
      errmsg:
        'WiredTigerIndex::insert: key too large to index, failing  1470 { : "56f37cb8e4b089e98d52ab0e", : "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..." }',
      code: 17280
    };

    test.server.setMessageHandler(request => {
      const doc = request.document;

      if (doc.ismaster) {
        return request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      }

      if (doc.createIndexes) {
        return request.reply(ERROR_RESPONSE);
      }

      if (doc.insert === 'system.indexes') {
        return request.reply(ERROR_RESPONSE);
      }
    });

    const client = this.configuration.newClient(`mongodb://${test.server.uri()}`);

    const close = e => client.close().then(() => done(e));

    client
      .connect()
      .then(() => client.db('foo').collection('bar'))
      .then(coll => coll.createIndex({ a: 1 }))
      .then(
        () => close('Expected createIndex to fail, but it succeeded'),
        e => {
          try {
            expect(e).to.have.property('ok', ERROR_RESPONSE.ok);
            expect(e).to.have.property('errmsg', ERROR_RESPONSE.errmsg);
            expect(e).to.have.property('code', ERROR_RESPONSE.code);
            close();
          } catch (err) {
            close(err);
          }
        }
      );
  });
});

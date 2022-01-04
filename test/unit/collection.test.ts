import { expect } from 'chai';

import { MongoClient } from '../../src';
import { isHello } from '../../src/utils';
import { cleanup, createServer, HELLO } from '../tools/mongodb-mock';

describe('Collection', function () {
  describe('createIndex', () => {
    const test = {
      server: null
    };
    beforeEach(() => createServer().then(_server => (test.server = _server)));
    afterEach(() => cleanup());

    it('should error when createIndex fails', function (done) {
      const ERROR_RESPONSE = {
        ok: 0,
        errmsg:
          'WiredTigerIndex::insert: key too large to index, failing  1470 { : "56f37cb8e4b089e98d52ab0e", : "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..." }',
        code: 17280
      };

      test.server.setMessageHandler(request => {
        const doc = request.document;

        if (isHello(doc)) {
          return request.reply(Object.assign({}, HELLO));
        }

        if (doc.createIndexes) {
          return request.reply(ERROR_RESPONSE);
        }

        if (doc.insert === 'system.indexes') {
          return request.reply(ERROR_RESPONSE);
        }
      });

      const client = new MongoClient(`mongodb://${test.server.uri()}`);

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
              close(null);
            } catch (err) {
              close(err);
            }
          }
        );
    });
  });
});

import { expect } from 'chai';

import { MongoClient } from '../../../src';
import { isHello } from '../../../src/utils';
import { cleanup, createServer, HELLO } from '../../tools/mongodb-mock';

describe('BulkWriteOperation', () => {
  context('bypass document validation', function () {
    let server = null;
    beforeEach(() =>
      createServer().then(_server => {
        server = _server;
      })
    );
    afterEach(() => cleanup());

    // general test for BulkWrite to test changes made in ordered.js and unordered.js
    function testBulkWrite(config, done) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);
      let close = e => {
        close = () => null;
        client.close(() => done(e));
      };

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.insert) {
          try {
            expect(doc.bypassDocumentValidation).equal(config.expected);
            request.reply({
              ok: 1
            });
          } catch (e) {
            close(e);
          }
        }

        if (isHello(doc)) {
          request.reply(Object.assign({}, HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        const db = client.db('test');
        const collection = db.collection('test_c');

        const options = {
          bypassDocumentValidation: config.actual,
          ordered: config.ordered
        };

        collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close(null));
      });
    }
    // ordered bulk write, testing change in ordered.js
    it('should only set bypass document validation if strictly true in ordered bulkWrite', function (done) {
      testBulkWrite({ expected: true, actual: true, ordered: true }, done);
    });

    it('should not set bypass document validation if not strictly true in ordered bulkWrite', function (done) {
      testBulkWrite({ expected: undefined, actual: false, ordered: true }, done);
    });

    // unordered bulk write, testing change in ordered.js
    it('should only set bypass document validation if strictly true in unordered bulkWrite', function (done) {
      testBulkWrite({ expected: true, actual: true, ordered: false }, done);
    });

    it('should not set bypass document validation if not strictly true in unordered bulkWrite', function (done) {
      testBulkWrite({ expected: undefined, actual: false, ordered: false }, done);
    });
  });
});
